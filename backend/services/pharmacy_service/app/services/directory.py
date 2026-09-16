from datetime import UTC, datetime

from fastapi import HTTPException
from pydantic import ValidationError
from shared.onboarding.receipts import ActivationReceipt
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from ..config import settings
from ..models import PharmacyDeployment, PharmacyDirectoryEvent, PharmacyProfile
from ..schemas.directory import DirectoryData, DirectoryFields, DirectoryView
from .photos import prune_photos

FIELDS = tuple(DirectoryFields.model_fields)


async def pharmacy_record(db, pharmacy_id, owner_id):
    pharmacy = await db.get(PharmacyProfile, pharmacy_id)
    receipt = await db.scalar(
        select(ActivationReceipt.id)
        .where(
            ActivationReceipt.resource_id == pharmacy_id,
            ActivationReceipt.applicant_id == owner_id,
            ActivationReceipt.role == "pharmacy",
        )
        .limit(1)
    )
    binding = await db.scalar(
        select(PharmacyDeployment).where(PharmacyDeployment.pharmacy_id == pharmacy_id)
    )
    if (
        not binding
        or not binding.activated_at
        or binding.deployment_key not in settings.pms_deployments
        or pharmacy is None
        or not pharmacy.is_active
        or pharmacy.user_id != owner_id
        or receipt is None
    ):
        raise HTTPException(
            404, "The approved pharmacy profile is unavailable. Contact support for reconciliation."
        )
    return pharmacy


def live_fields(pharmacy):
    return {name: getattr(pharmacy, name) for name in FIELDS}


def validated_fields(values):
    try:
        return DirectoryData.model_validate(values).model_dump(mode="json")
    except ValidationError as error:
        raise HTTPException(
            422,
            [
                {"loc": ["body", "changes", *item["loc"]], "msg": item["msg"], "type": item["type"]}
                for item in error.errors(include_context=False, include_url=False)
            ],
        ) from None


def publication_issues(values):
    try:
        data = DirectoryData.model_validate(values)
    except ValidationError as error:
        return [
            {"field": str(item["loc"][0]) if item["loc"] else "location", "message": item["msg"]}
            for item in error.errors(include_context=False, include_url=False)
        ]
    issues = []
    for name, label in (
        ("address_line1", "Street address"),
        ("city", "City"),
        ("country", "Country"),
    ):
        if not getattr(data, name):
            issues.append({"field": name, "message": f"{label} is required before publication."})
    if not data.email and not data.phone:
        issues.append(
            {
                "field": "contact",
                "message": "Add a contact phone number or email before publication.",
            }
        )
    if len(data.operating_hours or {}) != 7:
        issues.append(
            {
                "field": "operating_hours",
                "message": "Set opening hours or Closed for all seven days before publication.",
            }
        )
    return issues


def view(pharmacy):
    live = live_fields(pharmacy)
    draft = pharmacy.directory_draft or live
    return DirectoryView(
        pharmacy_id=pharmacy.id,
        version=pharmacy.directory_version,
        draft=draft,
        published=live if pharmacy.is_listable else None,
        is_listed=pharmacy.is_listable,
        has_unpublished_changes=draft != live,
        last_published_at=pharmacy.directory_published_at,
        publication_issues=publication_issues(draft),
        license_number=pharmacy.license_number,
        license_categories=pharmacy.license_categories,
    )


def require_version(pharmacy, version):
    if pharmacy.directory_version != version:
        raise HTTPException(
            409, "This pharmacy profile changed. Reload the saved profile before trying again."
        )


async def commit_change(db, pharmacy, actor, version, action, updates, before, after):
    result = await db.execute(
        update(PharmacyProfile)
        .where(
            PharmacyProfile.id == pharmacy.id,
            PharmacyProfile.user_id == actor.owner_user_id,
            PharmacyProfile.is_active.is_(True),
            PharmacyProfile.directory_version == version,
        )
        .values(**updates, directory_version=version + 1)
        .returning(PharmacyProfile.id)
        .execution_options(synchronize_session=False)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            409, "This pharmacy profile changed. Reload the saved profile before trying again."
        )
    changed = sorted(key for key in after if before.get(key) != after[key])
    db.add(
        PharmacyDirectoryEvent(
            pharmacy_id=pharmacy.id,
            actor_id=actor.actor_id,
            version=version + 1,
            action=action,
            changed_fields=changed,
            before={key: before.get(key) for key in changed},
            after={key: after[key] for key in changed},
        )
    )
    await db.flush()
    await db.refresh(pharmacy)
    await prune_photos(db, pharmacy)


async def save_draft(db, pharmacy_id, payload):
    pharmacy = await pharmacy_record(db, pharmacy_id, payload.owner_user_id)
    require_version(pharmacy, payload.version)
    before = pharmacy.directory_draft or live_fields(pharmacy)
    changes = payload.changes.model_dump(exclude_unset=True)
    if isinstance(changes.get("photo_url"), str) and changes["photo_url"].startswith("/"):
        raise HTTPException(422, "Use photo upload to attach a managed photo.")
    after = validated_fields({**before, **changes})
    if before != after:
        await commit_change(
            db,
            pharmacy,
            payload,
            payload.version,
            "draft.saved",
            # Public metadata should describe the published record. Draft timing
            # is retained by its event without changing the public updated_at.
            {"directory_draft": after, "updated_at": PharmacyProfile.updated_at},
            before,
            after,
        )
    return view(pharmacy)


async def publish(db, pharmacy_id, payload):
    pharmacy = await pharmacy_record(db, pharmacy_id, payload.owner_user_id)
    require_version(pharmacy, payload.version)
    draft = pharmacy.directory_draft or live_fields(pharmacy)
    issues = publication_issues(draft)
    if issues:
        raise HTTPException(
            422,
            [
                {
                    "loc": ["body", issue["field"]],
                    "msg": issue["message"],
                    "type": "publication_incomplete",
                }
                for issue in issues
            ],
        )
    after = validated_fields(draft)
    before = live_fields(pharmacy)
    if not pharmacy.is_listable or after != before:
        try:
            await commit_change(
                db,
                pharmacy,
                payload,
                payload.version,
                "profile.published",
                {
                    **after,
                    "directory_draft": after,
                    "is_listable": True,
                    "directory_published_at": datetime.now(UTC),
                },
                {**before, "is_listed": pharmacy.is_listable},
                {**after, "is_listed": True},
            )
        except IntegrityError:
            raise HTTPException(
                409, "These details conflict with an existing pharmacy. Check the pharmacy name."
            ) from None
    return view(pharmacy)


async def withdraw(db, pharmacy_id, payload):
    pharmacy = await pharmacy_record(db, pharmacy_id, payload.owner_user_id)
    require_version(pharmacy, payload.version)
    if pharmacy.is_listable:
        await commit_change(
            db,
            pharmacy,
            payload,
            payload.version,
            "profile.withdrawn",
            {"is_listable": False},
            {"is_listed": True},
            {"is_listed": False},
        )
    return view(pharmacy)


async def history(db, pharmacy_id, owner_id, offset):
    await pharmacy_record(db, pharmacy_id, owner_id)
    rows = (
        await db.scalars(
            select(PharmacyDirectoryEvent)
            .where(PharmacyDirectoryEvent.pharmacy_id == pharmacy_id)
            .order_by(PharmacyDirectoryEvent.version.desc())
            .offset(offset)
            .limit(21)
        )
    ).all()
    return {
        "items": [
            {
                "id": row.id,
                "actor_id": row.actor_id,
                "version": row.version,
                "action": row.action,
                "created_at": row.created_at,
                "changed_fields": row.changed_fields,
                "before": row.before,
                "after": row.after,
            }
            for row in rows[:20]
        ],
        "has_more": len(rows) > 20,
    }
