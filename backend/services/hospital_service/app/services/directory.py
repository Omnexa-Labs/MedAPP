from datetime import UTC, datetime

from fastapi import HTTPException
from pydantic import ValidationError
from shared.hospital_directory import DirectoryData, DirectoryFields, DirectoryView
from shared.onboarding.receipts import ActivationReceipt
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from ..models import HospitalDirectoryEvent, HospitalProfile

FIELDS = tuple(DirectoryFields.model_fields)


async def hospital_record(db, hospital_id, owner_id):
    hospital = await db.get(HospitalProfile, hospital_id)
    receipt = await db.scalar(
        select(ActivationReceipt.id)
        .where(
            ActivationReceipt.resource_id == hospital_id,
            ActivationReceipt.applicant_id == owner_id,
            ActivationReceipt.role == "hospital",
        )
        .limit(1)
    )
    if (
        hospital is None
        or not hospital.is_active
        or hospital.owner_user_id != owner_id
        or receipt is None
    ):
        raise HTTPException(
            404, "The approved hospital profile is unavailable. Contact support for reconciliation."
        )
    return hospital


def live_fields(hospital):
    return {name: getattr(hospital, name) for name in FIELDS}


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
    if not data.contact_email and not data.contact_phone:
        issues.append(
            {
                "field": "contact",
                "message": "Add a contact phone number or email before publication.",
            }
        )
    return issues


def view(hospital):
    live = live_fields(hospital)
    draft = hospital.directory_draft or live
    return DirectoryView(
        hospital_id=hospital.id,
        version=hospital.directory_version,
        draft=draft,
        published=live if hospital.is_listable else None,
        is_listed=hospital.is_listable,
        has_unpublished_changes=draft != live,
        last_published_at=hospital.directory_published_at,
        publication_issues=publication_issues(draft),
        accreditation=hospital.accreditation,
        accreditation_status=hospital.accreditation_status,
    )


def require_version(hospital, version):
    if hospital.directory_version != version:
        raise HTTPException(
            409, "This hospital profile changed. Reload the saved profile before trying again."
        )


async def commit_change(db, hospital, actor, version, action, updates, before, after):
    result = await db.execute(
        update(HospitalProfile)
        .where(
            HospitalProfile.id == hospital.id,
            HospitalProfile.owner_user_id == actor.owner_user_id,
            HospitalProfile.is_active.is_(True),
            HospitalProfile.directory_version == version,
        )
        .values(**updates, directory_version=version + 1)
        .returning(HospitalProfile.id)
        .execution_options(synchronize_session=False)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            409, "This hospital profile changed. Reload the saved profile before trying again."
        )
    changed = sorted(key for key in after if before.get(key) != after[key])
    db.add(
        HospitalDirectoryEvent(
            hospital_id=hospital.id,
            actor_id=actor.actor_id,
            version=version + 1,
            action=action,
            changed_fields=changed,
            before={key: before.get(key) for key in changed},
            after={key: after[key] for key in changed},
        )
    )
    await db.flush()
    await db.refresh(hospital)


async def save_draft(db, hospital_id, payload):
    hospital = await hospital_record(db, hospital_id, payload.owner_user_id)
    require_version(hospital, payload.version)
    before = hospital.directory_draft or live_fields(hospital)
    after = validated_fields({**before, **payload.changes.model_dump(exclude_unset=True)})
    if before != after:
        await commit_change(
            db,
            hospital,
            payload,
            payload.version,
            "draft.saved",
            # Public metadata should describe the published record. Draft timing
            # is retained by its event without changing the public updated_at.
            {"directory_draft": after, "updated_at": HospitalProfile.updated_at},
            before,
            after,
        )
    return view(hospital)


async def publish(db, hospital_id, payload):
    hospital = await hospital_record(db, hospital_id, payload.owner_user_id)
    require_version(hospital, payload.version)
    draft = hospital.directory_draft or live_fields(hospital)
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
    before = live_fields(hospital)
    if not hospital.is_listable or after != before:
        try:
            await commit_change(
                db,
                hospital,
                payload,
                payload.version,
                "profile.published",
                {
                    **after,
                    "directory_draft": after,
                    "is_listable": True,
                    "directory_published_at": datetime.now(UTC),
                },
                {**before, "is_listed": hospital.is_listable},
                {**after, "is_listed": True},
            )
        except IntegrityError:
            raise HTTPException(
                409, "These details conflict with an existing hospital. Check the hospital name."
            ) from None
    return view(hospital)


async def withdraw(db, hospital_id, payload):
    hospital = await hospital_record(db, hospital_id, payload.owner_user_id)
    require_version(hospital, payload.version)
    if hospital.is_listable:
        await commit_change(
            db,
            hospital,
            payload,
            payload.version,
            "profile.withdrawn",
            {"is_listable": False},
            {"is_listed": True},
            {"is_listed": False},
        )
    return view(hospital)


async def history(db, hospital_id, owner_id, offset):
    await hospital_record(db, hospital_id, owner_id)
    rows = (
        await db.scalars(
            select(HospitalDirectoryEvent)
            .where(HospitalDirectoryEvent.hospital_id == hospital_id)
            .order_by(HospitalDirectoryEvent.version.desc())
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
