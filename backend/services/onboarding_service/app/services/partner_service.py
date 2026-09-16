from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from hashlib import sha256
from uuid import UUID, uuid4

from fastapi import HTTPException
from shared.auth import Principal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import ApplicationEvent, PartnerApplication
from ..schemas.partner import (
    ApplicationReviewRequest,
    ApplicationStatus,
    PartnerApplicationCreate,
    PartnerApplicationSummaryOut,
    PartnerApplicationUpdate,
    ReviewAction,
    TeamMemberCreate,
)
from ..storage import DocumentStorage

ATTESTATION_VERSION = "professional-application-v1"
ATTESTATION_TEXT = (
    "I confirm that the information and credentials in this application are accurate and current, "
    "and that I am authorized to submit them for the named professional or organization. "
    "I understand that approval is subject to MedApp review."
)
DOCUMENT_KINDS = {
    "medical_license",
    "nursing_license",
    "government_id",
    "board_certificate",
    "registration_certificate",
    "pharmacy_license",
    "hospital_license",
    "tax_certificate",
}


class PartnerOnboardingError(ValueError):
    pass


def _now():
    return datetime.now(tz=UTC)


def _principal_uuid(principal: Principal) -> UUID:
    try:
        return UUID(principal.subject)
    except (ValueError, TypeError) as exc:
        raise HTTPException(401, "invalid principal subject") from exc


def _normalize_text(value: str | None) -> str | None:
    return value.strip() or None if value is not None else None


def _require_admin(principal: Principal):
    if principal.role not in {"admin", "platform_admin"}:
        raise HTTPException(403, "admin access required")


def _is_owner(principal, application):
    return application.submitted_by_user_id == _principal_uuid(principal)


def _ensure_reader(principal, application):
    if not _is_owner(principal, application):
        _require_admin(principal)


def _ensure_applicant(principal, application):
    if not _is_owner(principal, application):
        raise HTTPException(403, "only the applicant can change this application")


def ensure_draft(application):
    if application.status != "draft":
        raise HTTPException(
            409, "reopen a rejected application before editing; submitted applications are locked"
        )


async def get_application(db, principal, application_id):
    application = await db.get(PartnerApplication, application_id)
    if application is None:
        raise HTTPException(404, "application not found")
    _ensure_reader(principal, application)
    return application


async def locked_application(db, principal, application_id, expected_version, *, applicant=True):
    application = await db.scalar(
        select(PartnerApplication)
        .where(PartnerApplication.id == application_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if application is None:
        raise HTTPException(404, "application not found")
    (_ensure_applicant if applicant else _ensure_reader)(principal, application)
    if application.version != expected_version:
        raise HTTPException(412, "application changed; reload before saving")
    return application


def _snapshot(application):
    fields = (
        "partner_type",
        "onboarding_mode",
        "practitioner_role",
        "professional_first_name",
        "professional_last_name",
        "legal_name",
        "display_name",
        "specialty",
        "license_number",
        "registration_number",
        "tax_id",
        "country",
        "city",
        "address_line1",
        "email",
        "phone",
        "website_url",
        "notes",
        "status",
        "attestation_version",
    )
    return {
        **{name: getattr(application, name) for name in fields},
        "attestation_text": ATTESTATION_TEXT
        if application.attestation_version == ATTESTATION_VERSION
        else None,
        "documents": deepcopy(application.documents_json),
        "team_members": deepcopy(application.team_members_json),
        **{
            name: value.isoformat() if (value := getattr(application, name)) else None
            for name in ("attested_at", "submitted_at", "reviewed_at")
        },
    }


async def _record(db, principal, application, action, details=None, *, touch=True):
    if touch:
        application.updated_at = _now()
    await db.flush()
    event = ApplicationEvent(
        application_id=application.id,
        actor_id=_principal_uuid(principal),
        action=action,
        application_version=application.version,
        details=deepcopy(details or {}),
    )
    db.add(event)
    await db.flush()
    await db.refresh(application)
    return application


def _team_member_payload(member, principal):
    return {
        "member_id": str(uuid4()),
        "full_name": member.full_name.strip(),
        "user_id": str(member.user_id) if member.user_id else None,
        "role": member.role.strip(),
        "title": _normalize_text(member.title),
        "specialty": _normalize_text(member.specialty),
        "email": _normalize_text(member.email),
        "phone": _normalize_text(member.phone),
        "is_primary": member.is_primary,
        "added_by_user_id": str(_principal_uuid(principal)),
        "added_at": _now().isoformat(),
    }


async def create_application(
    db: AsyncSession, principal: Principal, payload: PartnerApplicationCreate
):
    data = payload.model_dump(exclude={"documents", "team_members"})
    data = {
        key: _normalize_text(value) if isinstance(value, str) else value
        for key, value in data.items()
    }
    if not data["legal_name"]:
        raise PartnerOnboardingError("legal name is required")
    data["display_name"] = data["display_name"] or data["legal_name"]
    if payload.partner_type != "hospital" and payload.team_members:
        raise PartnerOnboardingError("team members apply only to hospital applications")
    application = PartnerApplication(
        **data,
        submitted_by_user_id=_principal_uuid(principal),
        status="draft",
        documents_json=[],
        team_members_json=[_team_member_payload(m, principal) for m in payload.team_members],
    )
    db.add(application)
    return await _record(db, principal, application, "created", touch=False)


async def update_application(
    db, principal, application_id, payload: PartnerApplicationUpdate, expected_version
):
    application = await locked_application(db, principal, application_id, expected_version)
    ensure_draft(application)
    updates = payload.model_dump(exclude_unset=True)
    if application.partner_type != "practitioner" and any(
        updates.get(k) is not None
        for k in ("practitioner_role", "professional_first_name", "professional_last_name")
    ):
        raise PartnerOnboardingError(
            "professional identity applies only to practitioner applications"
        )
    for key, value in updates.items():
        setattr(application, key, _normalize_text(value) if isinstance(value, str) else value)
    if not updates:
        return application
    return await _record(db, principal, application, "details_updated", {"fields": sorted(updates)})


async def list_applications(db, principal, *, status_filter: ApplicationStatus | None = None):
    stmt = select(PartnerApplication).order_by(
        PartnerApplication.created_at.desc(), PartnerApplication.id.desc()
    )
    if principal.role not in {"admin", "platform_admin"}:
        stmt = stmt.where(PartnerApplication.submitted_by_user_id == _principal_uuid(principal))
    if status_filter is not None:
        stmt = stmt.where(PartnerApplication.status == status_filter.value)
    return list((await db.scalars(stmt)).all())


async def get_application_summary(db, principal):
    applications = await list_applications(db, principal)
    counts = {s.value: sum(a.status == s.value for a in applications) for s in ApplicationStatus}
    return PartnerApplicationSummaryOut(
        total_count=len(applications),
        draft_count=counts["draft"],
        submitted_count=counts["submitted"],
        under_review_count=counts["under_review"],
        approved_count=counts["approved"],
        rejected_count=counts["rejected"],
        recent_applications=applications[:3],
    )


def validate_file(data, content_type):
    signatures = {
        "application/pdf": b"%PDF-",
        "image/png": b"\x89PNG\r\n\x1a\n",
        "image/jpeg": b"\xff\xd8\xff",
    }
    if not data:
        raise HTTPException(400, "empty document")
    if content_type not in signatures or not data.startswith(signatures[content_type]):
        raise HTTPException(415, "upload a PDF, PNG or JPEG whose content matches its type")


async def add_document(
    db,
    principal,
    application_id,
    *,
    expected_version,
    kind,
    label,
    content_type,
    data,
    storage: DocumentStorage,
):
    application = await locked_application(db, principal, application_id, expected_version)
    ensure_draft(application)
    if kind not in DOCUMENT_KINDS:
        raise HTTPException(422, "unsupported document kind")
    if len(application.documents_json) >= settings.document_limit:
        raise HTTPException(409, "application document limit reached")
    if len(data) > settings.document_max_bytes:
        raise HTTPException(413, "document exceeds the upload limit")
    validate_file(data, content_type)
    document_id = str(uuid4())
    key = f"onboarding/{application.id}/{document_id}"
    try:
        generation = await storage.write(key, data, content_type)
    except Exception as exc:
        raise HTTPException(
            503, "document storage is unavailable; reload the application before retrying"
        ) from exc
    metadata = {
        "document_id": document_id,
        "kind": kind,
        "label": _normalize_text(label),
        "url": f"/v1/onboarding/applications/{application.id}/documents/{document_id}/content",
        "content_type": content_type,
        "size_bytes": len(data),
        "sha256": sha256(data).hexdigest(),
        "storage_key": key,
        "storage_generation": generation,
        "verified": False,
        "uploaded_by_user_id": str(_principal_uuid(principal)),
        "uploaded_at": _now().isoformat(),
    }
    application.documents_json = [*application.documents_json, metadata]
    # Store before referencing the object. Failed DB commits can leave an orphan;
    # do not delete after an uncertain commit, which could erase a committed file.
    return await _record(
        db, principal, application, "document_uploaded", {"document_id": document_id}
    )


async def remove_document(db, principal, application_id, document_id, expected_version):
    application = await locked_application(db, principal, application_id, expected_version)
    ensure_draft(application)
    documents = [d for d in application.documents_json if d["document_id"] != str(document_id)]
    if len(documents) == len(application.documents_json):
        raise HTTPException(404, "document not found")
    removed = next(d for d in application.documents_json if d["document_id"] == str(document_id))
    application.documents_json = documents
    return await _record(db, principal, application, "document_removed", {"documents": [removed]})


async def get_document(db, principal, application_id, document_id, storage):
    application = await get_application(db, principal, application_id)
    documents = list(application.documents_json)
    history = await db.scalars(
        select(ApplicationEvent).where(ApplicationEvent.application_id == application_id)
    )
    for event in history:
        documents.extend(event.details.get("documents", []))
    document = next((d for d in documents if d["document_id"] == str(document_id)), None)
    if not document or not document.get("storage_key"):
        raise HTTPException(404, "managed document not found")
    try:
        data = await storage.read(
            document["storage_key"], document["storage_generation"], settings.document_max_bytes
        )
    except Exception as exc:
        raise HTTPException(503, "document is temporarily unavailable") from exc
    if len(data) != document["size_bytes"] or sha256(data).hexdigest() != document["sha256"]:
        raise HTTPException(503, "document integrity check failed")
    return document, data


async def add_team_member(
    db, principal, application_id, payload: TeamMemberCreate, expected_version
):
    application = await locked_application(db, principal, application_id, expected_version)
    ensure_draft(application)
    if application.partner_type != "hospital":
        raise PartnerOnboardingError("team members apply only to hospital applications")
    if len(application.team_members_json) >= 50:
        raise HTTPException(409, "team member limit reached")
    if not payload.full_name.strip() or not payload.role.strip():
        raise PartnerOnboardingError("team member name and role are required")
    application.team_members_json = [
        *application.team_members_json,
        _team_member_payload(payload, principal),
    ]
    return await _record(db, principal, application, "team_member_added")


async def remove_team_member(db, principal, application_id, member_id, expected_version):
    application = await locked_application(db, principal, application_id, expected_version)
    ensure_draft(application)
    members = [m for m in application.team_members_json if m["member_id"] != str(member_id)]
    if len(members) == len(application.team_members_json):
        raise HTTPException(404, "team member not found")
    application.team_members_json = members
    return await _record(db, principal, application, "team_member_removed")


def required_document_kinds(application):
    if application.partner_type == "practitioner":
        return {
            "nursing_license" if application.practitioner_role == "nurse" else "medical_license",
            "government_id",
        }
    if application.partner_type == "pharmacy":
        return {"pharmacy_license", "registration_certificate"}
    return {"hospital_license", "registration_certificate"}


def required_fields(application):
    required = ["legal_name", "country", "city", "email", "phone"]
    if application.partner_type == "practitioner":
        required += [
            "practitioner_role",
            "professional_first_name",
            "professional_last_name",
            "specialty",
            "license_number",
        ]
    else:
        required += ["address_line1", "registration_number", "license_number"]
    return required


def application_requirements(application):
    return {
        "required_fields": required_fields(application),
        "required_document_kinds": sorted(required_document_kinds(application)),
        "allowed_document_kinds": sorted(DOCUMENT_KINDS),
        "allowed_content_types": ["application/pdf", "image/png", "image/jpeg"],
        "max_document_bytes": settings.document_max_bytes,
        "max_documents": settings.document_limit,
        "requires_team_member": application.partner_type == "hospital"
        and application.onboarding_mode == "team",
        "attestation_version": ATTESTATION_VERSION,
        "attestation_text": ATTESTATION_TEXT,
    }


def validate_submission(application):
    required = required_fields(application)
    missing = [name for name in required if not getattr(application, name)]
    if missing:
        raise PartnerOnboardingError("complete required details: " + ", ".join(missing))
    present = {d["kind"] for d in application.documents_json if d.get("storage_key")}
    absent = required_document_kinds(application) - present
    if absent:
        raise PartnerOnboardingError("upload required documents: " + ", ".join(sorted(absent)))
    if (
        application.partner_type == "hospital"
        and application.onboarding_mode == "team"
        and not application.team_members_json
    ):
        raise PartnerOnboardingError("team onboarding requires at least one team member")


async def submit_application(db, principal, application_id, expected_version):
    application = await locked_application(db, principal, application_id, expected_version)
    ensure_draft(application)
    validate_submission(application)
    application.status = "submitted"
    application.submitted_at = application.attested_at = _now()
    application.attestation_version = ATTESTATION_VERSION
    application.rejection_reason = None
    return await _record(db, principal, application, "submitted", _snapshot(application))


async def reopen_application(db, principal, application_id, expected_version):
    application = await locked_application(db, principal, application_id, expected_version)
    if application.status != "rejected":
        raise HTTPException(409, "only rejected applications can be reopened")
    application.status = "draft"
    application.attested_at = application.attestation_version = None
    application.documents_json = [
        {**d, "verified": False, "verified_by_user_id": None, "verified_at": None}
        for d in application.documents_json
    ]
    return await _record(db, principal, application, "reopened")


async def review_application(
    db, principal, application_id, payload: ApplicationReviewRequest, expected_version
):
    _require_admin(principal)
    application = await locked_application(
        db, principal, application_id, expected_version, applicant=False
    )
    if _is_owner(principal, application):
        raise HTTPException(403, "reviewers cannot review their own applications")
    if application.status not in {"submitted", "under_review"}:
        raise HTTPException(409, "only submitted or under-review applications can be reviewed")
    verified_ids = {str(value) for value in payload.verified_document_ids}
    if verified_ids and payload.action != ReviewAction.APPROVE:
        raise PartnerOnboardingError("document verification belongs to an approval decision")
    if payload.action == ReviewAction.REJECT and not _normalize_text(payload.rejection_reason):
        raise PartnerOnboardingError("rejection feedback is required")
    if payload.action == ReviewAction.APPROVE:
        validate_submission(application)
        if application.attestation_version != ATTESTATION_VERSION or not application.attested_at:
            raise PartnerOnboardingError("the applicant must submit the current attestation")
        documents = application.documents_json
        if verified_ids - {d["document_id"] for d in documents}:
            raise PartnerOnboardingError("verification refers to an unknown document")
        verified_kinds = {
            d["kind"]
            for d in documents
            if d["document_id"] in verified_ids and d.get("storage_key")
        }
        if required_document_kinds(application) - verified_kinds:
            raise PartnerOnboardingError(
                "review and verify every required credential before approval"
            )
        application.documents_json = [
            {
                **d,
                "verified": d["document_id"] in verified_ids,
                "verified_by_user_id": str(_principal_uuid(principal))
                if d["document_id"] in verified_ids
                else None,
                "verified_at": _now().isoformat() if d["document_id"] in verified_ids else None,
            }
            for d in documents
        ]
    application.status = {
        ReviewAction.APPROVE: "approved",
        ReviewAction.REJECT: "rejected",
        ReviewAction.UNDER_REVIEW: "under_review",
    }[payload.action]
    application.reviewed_by_user_id = _principal_uuid(principal)
    application.reviewed_at = _now()
    application.rejection_reason = (
        _normalize_text(payload.rejection_reason) if payload.action == ReviewAction.REJECT else None
    )
    application = await _record(
        db,
        principal,
        application,
        application.status,
        {**_snapshot(application), "rejection_reason": application.rejection_reason},
    )
    if payload.action == ReviewAction.APPROVE:
        from .activation import queue_activation

        await queue_activation(db, application)
    return application


async def application_history(db, principal, application_id):
    await get_application(db, principal, application_id)
    rows = await db.scalars(
        select(ApplicationEvent)
        .where(ApplicationEvent.application_id == application_id)
        .order_by(
            ApplicationEvent.application_version, ApplicationEvent.created_at, ApplicationEvent.id
        )
    )
    result = []
    for row in rows:
        details = deepcopy(row.details)
        for document in details.get("documents", []):
            document.pop("storage_key", None)
            document.pop("storage_generation", None)
        result.append(
            {
                "event_id": row.id,
                "actor_id": row.actor_id,
                "action": row.action,
                "application_version": row.application_version,
                "created_at": row.created_at,
                "details": details,
            }
        )
    return result
