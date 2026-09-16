"""Scan orchestration: bytes → vision LLM → parsed ScanResult.

The synchronous LLM call runs on a worker thread (matching the pattern in
every other agent). The vision provider attaches the image via the
LLMProvider.images parameter — translation into the provider's native
format is the provider's job, not ours.

If the configured provider doesn't support vision (e.g. `mock` in tests),
we still attempt the call. `MockLLM` accepts images and ignores them; the
parser then degrades to a low-confidence empty result. Real production
providers (OpenAI 4.x, Claude 3) translate properly.
"""
from __future__ import annotations

import asyncio
import logging

from agents.shared import (
    ImagePart,
    LLMChatTurn,
    LLMProvider,
    prompt_path,
)

from .parser import ScanResult, parse

logger = logging.getLogger(__name__)


_EXTRACTION_PROMPT_PATH = prompt_path("_lab_reader_extraction.md")


def _load_extraction_prompt() -> str:
    try:
        return _EXTRACTION_PROMPT_PATH.read_text(encoding="utf-8")
    except OSError:
        logger.warning("lab_reader.extraction_prompt_missing path=%s", _EXTRACTION_PROMPT_PATH)
        return ""


_EXTRACTION_PROMPT = _load_extraction_prompt()


async def scan_image(
    provider: LLMProvider,
    *,
    image_bytes: bytes,
    media_type: str,
    doc_type_hint: str | None = None,
    max_tokens: int = 1500,
) -> ScanResult:
    """Run the extraction LLM on a single image and return a parsed result.

    Never raises. Provider exceptions are caught and surfaced as a
    low-confidence empty result with the failure in `warnings`.
    """
    if not _EXTRACTION_PROMPT:
        return ScanResult(
            doc_type="unknown",
            tests=[],
            summary="Lab reader is misconfigured (extraction prompt missing).",
            confidence="low",
            warnings=["extraction_prompt_missing"],
        )

    user_text = _build_user_text(doc_type_hint)
    image_part = ImagePart(data=image_bytes, media_type=media_type, detail="high")

    def _run():
        return provider.run(
            system_prompt=_EXTRACTION_PROMPT,
            messages=[LLMChatTurn(role="user", content=user_text)],
            tools=[],
            executor=lambda *_: "",
            max_tokens=max_tokens,
            images=[image_part],
        )

    try:
        result = await asyncio.to_thread(_run)
    except NotImplementedError as e:
        # Provider declared no vision support. Honest failure.
        logger.warning("lab_reader.provider_no_vision err=%s", e)
        return ScanResult(
            doc_type="unknown",
            tests=[],
            summary="The configured LLM provider does not support vision.",
            confidence="low",
            warnings=["provider does not support vision"],
        )
    except Exception:
        logger.exception("lab_reader.provider_call_failed")
        return ScanResult(
            doc_type="unknown",
            tests=[],
            summary="The lab reader could not process the image.",
            confidence="low",
            warnings=["llm provider error"],
        )

    return parse(result.reply)


def _build_user_text(doc_type_hint: str | None) -> str:
    if doc_type_hint and doc_type_hint in ("lab_report", "prescription"):
        return (
            f"This image is a {doc_type_hint}. Extract its contents per the "
            "schema in the system prompt."
        )
    return (
        "Extract the contents of this image per the schema in the system "
        "prompt. If you cannot determine the document type, set doc_type "
        "to 'unknown'."
    )
