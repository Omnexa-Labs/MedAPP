"""scan_image() orchestration tests.

We don't run a real vision model. A scripted LLMProvider returns a
canned reply and the test asserts the parsed-result wiring. Provider
exceptions and `NotImplementedError` are also covered.
"""
from __future__ import annotations

from typing import Any

import pytest

from agents.shared import LLMResult

from app.scan import scan_image


class _ScriptedProvider:
    """Returns the reply you give it; records images for assertion."""

    def __init__(self, reply: str, *, raise_exc: BaseException | None = None) -> None:
        self._reply = reply
        self._raise = raise_exc
        self.captured_images: list[Any] = []
        self.captured_system_prompt: str | None = None

    def run(self, *, system_prompt, messages, tools, executor, max_tokens=4096, images=None):
        if self._raise is not None:
            raise self._raise
        self.captured_images = list(images or [])
        self.captured_system_prompt = system_prompt
        return LLMResult(reply=self._reply, tool_calls=[], usage={})


_VALID_REPLY = (
    '{"doc_type":"lab_report",'
    '"tests":[{"name":"Hemoglobin","value":13.2,"unit":"g/dL","reference_range":"12.0-15.5","flag":"normal"}],'
    '"summary":"One result, all values normal.","confidence":"high","warnings":[]}'
)


@pytest.mark.asyncio
async def test_scan_returns_parsed_result() -> None:
    provider = _ScriptedProvider(_VALID_REPLY)
    r = await scan_image(provider, image_bytes=b"\x89PNG\x00", media_type="image/png")
    assert r.doc_type == "lab_report"
    assert len(r.tests) == 1
    assert r.tests[0].name == "Hemoglobin"
    assert r.confidence == "high"


@pytest.mark.asyncio
async def test_scan_attaches_image_to_provider() -> None:
    provider = _ScriptedProvider(_VALID_REPLY)
    await scan_image(provider, image_bytes=b"\xff\xd8\xff", media_type="image/jpeg")
    assert len(provider.captured_images) == 1
    img = provider.captured_images[0]
    assert img.media_type == "image/jpeg"
    assert img.data == b"\xff\xd8\xff"


@pytest.mark.asyncio
async def test_scan_uses_the_extraction_prompt() -> None:
    """Make sure we don't accidentally send the chat persona on the /scan path."""
    provider = _ScriptedProvider(_VALID_REPLY)
    await scan_image(provider, image_bytes=b"\x89PNG\x00", media_type="image/png")
    assert provider.captured_system_prompt is not None
    # The extraction prompt has a specific phrase the chat prompt does not.
    assert "Output schema" in provider.captured_system_prompt
    assert "MedApp Lab Reader" not in provider.captured_system_prompt


@pytest.mark.asyncio
async def test_scan_handles_provider_exception() -> None:
    provider = _ScriptedProvider("", raise_exc=RuntimeError("network down"))
    r = await scan_image(provider, image_bytes=b"\x89PNG\x00", media_type="image/png")
    assert r.confidence == "low"
    assert r.doc_type == "unknown"
    assert r.tests == []
    assert any("error" in w.lower() for w in r.warnings)


@pytest.mark.asyncio
async def test_scan_handles_provider_not_implementing_vision() -> None:
    provider = _ScriptedProvider("", raise_exc=NotImplementedError("no vision"))
    r = await scan_image(provider, image_bytes=b"\x89PNG\x00", media_type="image/png")
    assert r.confidence == "low"
    assert any("vision" in w.lower() for w in r.warnings)


@pytest.mark.asyncio
async def test_scan_handles_garbage_llm_output() -> None:
    provider = _ScriptedProvider("I cannot do this.")
    r = await scan_image(provider, image_bytes=b"\x89PNG\x00", media_type="image/png")
    assert r.confidence == "low"
    assert r.tests == []


@pytest.mark.asyncio
async def test_doc_type_hint_propagates_to_user_message() -> None:
    """The hint should change the user-message text so the LLM knows the type."""
    captured_messages: dict = {}

    class _Capturing(_ScriptedProvider):
        def run(self, *, system_prompt, messages, tools, executor, max_tokens=4096, images=None):
            captured_messages["messages"] = list(messages)
            return LLMResult(reply=_VALID_REPLY, tool_calls=[], usage={})

    provider = _Capturing(_VALID_REPLY)
    await scan_image(
        provider,
        image_bytes=b"\x89PNG\x00",
        media_type="image/png",
        doc_type_hint="prescription",
    )
    msgs = captured_messages["messages"]
    assert any("prescription" in m.content.lower() for m in msgs if m.role == "user")
