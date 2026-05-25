"""Lab Reader service entry point.

Exposes the standard /healthz and /chat endpoints from `make_app`, plus a
/scan endpoint that runs the vision-based extraction pipeline.

`/scan` is JWT-authenticated and IDOR-guarded via the same dependency
the rest of the agent layer uses. Patient-role tokens can only scan
their own documents; admin tokens may pass an explicit `patient_id`.
"""
from __future__ import annotations

import base64
import binascii
from dataclasses import asdict
from typing import Any

from fastapi import Depends, HTTPException, status
from pydantic import BaseModel, Field

from agents.shared import Principal, enforce_patient_scope, make_app

from .agent import LabReaderAgent
from .config import settings

_agent = LabReaderAgent()
app = make_app(_agent, service_name="lab_reader_agent")
_require_principal = app.state.require_principal


class ScanRequest(BaseModel):
    image_b64: str = Field(
        ...,
        description="Base64-encoded image bytes (no data:URI prefix).",
    )
    media_type: str = Field(
        ...,
        description="One of image/png, image/jpeg, image/webp.",
    )
    patient_id: str | None = None
    doc_type_hint: str | None = Field(
        None,
        description="Optional hint: 'lab_report' or 'prescription'.",
    )


class ScanResponse(BaseModel):
    patient_id: str
    doc_type: str
    tests: list[dict[str, Any]]
    summary: str
    confidence: str
    warnings: list[str]


@app.post("/scan", response_model=ScanResponse)
async def scan(
    req: ScanRequest,
    principal: Principal = Depends(_require_principal),
) -> ScanResponse:
    resolved_patient_id = enforce_patient_scope(
        requested=req.patient_id, principal=principal
    )

    if req.media_type not in settings.allowed_media_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"media_type must be one of {sorted(settings.allowed_media_types)}; "
                f"PDFs and other formats are not yet supported"
            ),
        )

    try:
        image_bytes = base64.b64decode(req.image_b64, validate=True)
    except (binascii.Error, ValueError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="image_b64 is not valid base64",
        ) from e

    if len(image_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="image_b64 decoded to zero bytes",
        )
    if len(image_bytes) > settings.max_image_bytes:
        # Starlette renamed the constant; the literal is forward-compatible.
        raise HTTPException(
            status_code=413,
            detail=(
                f"decoded image is {len(image_bytes)} bytes; max is "
                f"{settings.max_image_bytes}"
            ),
        )

    result = await _agent.scan(
        image_bytes=image_bytes,
        media_type=req.media_type,
        doc_type_hint=req.doc_type_hint,
    )

    return ScanResponse(
        patient_id=resolved_patient_id,
        doc_type=result.doc_type,
        tests=[_test_to_dict(t) for t in result.tests],
        summary=result.summary,
        confidence=result.confidence,
        warnings=list(result.warnings),
    )


def _test_to_dict(t) -> dict[str, Any]:  # noqa: ANN001
    return asdict(t)
