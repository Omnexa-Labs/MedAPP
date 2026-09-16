from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from shared.auth import Principal
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..deps import CurrentPrincipal, DbSession, VersionMatch
from ..schemas.partner import (
    ApplicationActivationOut,
    ApplicationEventOut,
    ApplicationReviewRequest,
    ApplicationStatus,
    ApplicationSubmitRequest,
    PartnerApplicationCreate,
    PartnerApplicationList,
    PartnerApplicationOut,
    PartnerApplicationSummaryOut,
    PartnerApplicationUpdate,
    TeamMemberCreate,
)
from ..services import partner_service as service
from ..storage import DocumentStorage, get_storage

DocumentStore = Depends(get_storage)

router = APIRouter(prefix="/v1/onboarding", tags=["Onboarding"])


def application_response(application, response: Response):
    response.headers["ETag"] = f'"{application.version}"'
    return PartnerApplicationOut.model_validate(application)


@router.post("/applications", response_model=PartnerApplicationOut, status_code=201)
async def create(
    payload: PartnerApplicationCreate,
    response: Response,
    db: AsyncSession = DbSession,
    principal: Principal = CurrentPrincipal,
):
    return application_response(await service.create_application(db, principal, payload), response)


@router.get("/applications", response_model=PartnerApplicationList)
async def index(
    status_filter: Annotated[ApplicationStatus | None, Query(alias="status")] = None,
    db: AsyncSession = DbSession,
    principal: Principal = CurrentPrincipal,
):
    applications = await service.list_applications(db, principal, status_filter=status_filter)
    return PartnerApplicationList(
        items=[PartnerApplicationOut.model_validate(a) for a in applications]
    )


@router.get("/summary", response_model=PartnerApplicationSummaryOut)
async def summary(db: AsyncSession = DbSession, principal: Principal = CurrentPrincipal):
    return await service.get_application_summary(db, principal)


@router.get("/applications/{application_id}", response_model=PartnerApplicationOut)
async def read(
    application_id: UUID,
    response: Response,
    db: AsyncSession = DbSession,
    principal: Principal = CurrentPrincipal,
):
    return application_response(
        await service.get_application(db, principal, application_id), response
    )


@router.patch("/applications/{application_id}", response_model=PartnerApplicationOut)
async def update(
    application_id: UUID,
    payload: PartnerApplicationUpdate,
    response: Response,
    version: int = VersionMatch,
    db: AsyncSession = DbSession,
    principal: Principal = CurrentPrincipal,
):
    return application_response(
        await service.update_application(db, principal, application_id, payload, version), response
    )


@router.post("/applications/{application_id}/documents", deprecated=True)
async def legacy_document(
    application_id: UUID, db: AsyncSession = DbSession, principal: Principal = CurrentPrincipal
):
    await service.get_application(db, principal, application_id)
    raise HTTPException(
        410, "document links are no longer accepted; upload the file to documents/upload"
    )


@router.post(
    "/applications/{application_id}/documents/upload",
    response_model=PartnerApplicationOut,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                mime: {"schema": {"type": "string", "format": "binary"}}
                for mime in ("application/pdf", "image/png", "image/jpeg")
            },
        }
    },
)
async def upload_document(
    application_id: UUID,
    request: Request,
    response: Response,
    kind: Annotated[str, Query(min_length=1, max_length=64)],
    label: Annotated[str | None, Query(max_length=255)] = None,
    version: int = VersionMatch,
    db: AsyncSession = DbSession,
    principal: Principal = CurrentPrincipal,
    storage: DocumentStorage = DocumentStore,
):
    # Check ownership, version and state before consuming potentially large request data.
    application = await service.locked_application(db, principal, application_id, version)
    service.ensure_draft(application)
    if kind not in service.DOCUMENT_KINDS:
        raise HTTPException(422, "unsupported document kind")
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type not in {"application/pdf", "image/png", "image/jpeg"}:
        raise HTTPException(415, "upload a PDF, PNG or JPEG")
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            length = int(content_length)
        except ValueError as exc:
            raise HTTPException(400, "invalid Content-Length") from exc
        if length < 0:
            raise HTTPException(400, "invalid Content-Length")
        if length > settings.document_max_bytes:
            raise HTTPException(413, "document exceeds the upload limit")
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > settings.document_max_bytes:
            raise HTTPException(413, "document exceeds the upload limit")
        data.extend(chunk)
    application = await service.add_document(
        db,
        principal,
        application_id,
        expected_version=version,
        kind=kind,
        label=label,
        content_type=content_type,
        data=bytes(data),
        storage=storage,
    )
    return application_response(application, response)


@router.delete(
    "/applications/{application_id}/documents/{document_id}", response_model=PartnerApplicationOut
)
async def remove_document(
    application_id: UUID,
    document_id: UUID,
    response: Response,
    version: int = VersionMatch,
    db: AsyncSession = DbSession,
    principal: Principal = CurrentPrincipal,
):
    return application_response(
        await service.remove_document(db, principal, application_id, document_id, version), response
    )


@router.get("/applications/{application_id}/documents/{document_id}/content")
async def download_document(
    application_id: UUID,
    document_id: UUID,
    db: AsyncSession = DbSession,
    principal: Principal = CurrentPrincipal,
    storage: DocumentStorage = DocumentStore,
):
    document, data = await service.get_document(db, principal, application_id, document_id, storage)
    extension = {"application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg"}[
        document["content_type"]
    ]
    return Response(
        content=data,
        media_type=document["content_type"],
        headers={
            "Content-Disposition": f'attachment; filename="{document_id}.{extension}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/applications/{application_id}/team-members", response_model=PartnerApplicationOut)
async def add_member(
    application_id: UUID,
    payload: TeamMemberCreate,
    response: Response,
    version: int = VersionMatch,
    db: AsyncSession = DbSession,
    principal: Principal = CurrentPrincipal,
):
    return application_response(
        await service.add_team_member(db, principal, application_id, payload, version), response
    )


@router.delete(
    "/applications/{application_id}/team-members/{member_id}", response_model=PartnerApplicationOut
)
async def remove_member(
    application_id: UUID,
    member_id: UUID,
    response: Response,
    version: int = VersionMatch,
    db: AsyncSession = DbSession,
    principal: Principal = CurrentPrincipal,
):
    return application_response(
        await service.remove_team_member(db, principal, application_id, member_id, version),
        response,
    )


@router.post("/applications/{application_id}/submit", response_model=PartnerApplicationOut)
async def submit(
    application_id: UUID,
    payload: ApplicationSubmitRequest,
    response: Response,
    version: int = VersionMatch,
    db: AsyncSession = DbSession,
    principal: Principal = CurrentPrincipal,
):
    return application_response(
        await service.submit_application(db, principal, application_id, version), response
    )


@router.post("/applications/{application_id}/reopen", response_model=PartnerApplicationOut)
async def reopen(
    application_id: UUID,
    response: Response,
    version: int = VersionMatch,
    db: AsyncSession = DbSession,
    principal: Principal = CurrentPrincipal,
):
    return application_response(
        await service.reopen_application(db, principal, application_id, version), response
    )


@router.post("/applications/{application_id}/review", response_model=PartnerApplicationOut)
async def review(
    application_id: UUID,
    payload: ApplicationReviewRequest,
    response: Response,
    version: int = VersionMatch,
    db: AsyncSession = DbSession,
    principal: Principal = CurrentPrincipal,
):
    return application_response(
        await service.review_application(db, principal, application_id, payload, version), response
    )


@router.get("/applications/{application_id}/history", response_model=list[ApplicationEventOut])
async def history(
    application_id: UUID, db: AsyncSession = DbSession, principal: Principal = CurrentPrincipal
):
    return await service.application_history(db, principal, application_id)


@router.get("/applications/{application_id}/requirements")
async def requirements(
    application_id: UUID, db: AsyncSession = DbSession, principal: Principal = CurrentPrincipal
):
    application = await service.get_application(db, principal, application_id)
    return service.application_requirements(application)


@router.get("/applications/{application_id}/activation", response_model=ApplicationActivationOut)
async def activation_status(
    application_id: UUID, db: AsyncSession = DbSession, principal: Principal = CurrentPrincipal
):
    from sqlalchemy import select

    from ..models import ApplicationActivation
    from ..services.activation import activation_status as present

    await service.get_application(db, principal, application_id)
    job = await db.scalar(
        select(ApplicationActivation).where(ApplicationActivation.application_id == application_id)
    )
    return present(job)


@router.post(
    "/applications/{application_id}/activation/retry", response_model=ApplicationActivationOut
)
async def retry_activation(
    application_id: UUID,
    version: int = VersionMatch,
    db: AsyncSession = DbSession,
    principal: Principal = CurrentPrincipal,
):
    from ..services.activation import activation_status as present
    from ..services.activation import retry_activation as retry

    return present(await retry(db, principal, application_id, version))
