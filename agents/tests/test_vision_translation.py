"""Vision translation helpers in OpenAICompatProvider.

These exercise `_attach_images_to_last_user` and `_image_to_part` directly
— the helpers don't import the openai SDK, so this test runs in the
default venv (unlike test_openai_compat.py which uses importorskip).

Pinning the OpenAI multimodal wire shape here means a future provider
update that breaks the format will fail loudly in CI, not on the next
real lab scan in production.
"""
from __future__ import annotations

import base64

from agents.shared import ImagePart
from agents.shared.providers.openai_compat import (
    _attach_images_to_last_user,
    _image_to_part,
)


def test_image_to_part_builds_data_uri() -> None:
    img = ImagePart(data=b"\x89PNG\x00", media_type="image/png", detail="high")
    part = _image_to_part(img)
    assert part["type"] == "image_url"
    assert part["image_url"]["detail"] == "high"
    expected_b64 = base64.b64encode(b"\x89PNG\x00").decode("ascii")
    assert part["image_url"]["url"] == f"data:image/png;base64,{expected_b64}"


def test_attach_images_converts_last_user_content_to_list() -> None:
    msgs = [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "extract the labs"},
    ]
    _attach_images_to_last_user(
        msgs, [ImagePart(data=b"\xff\xd8\xff", media_type="image/jpeg")]
    )
    # User message content is now a list of parts.
    last = msgs[-1]
    assert isinstance(last["content"], list)
    assert last["content"][0] == {"type": "text", "text": "extract the labs"}
    assert last["content"][1]["type"] == "image_url"


def test_attach_images_appends_multiple_images_in_order() -> None:
    msgs = [{"role": "user", "content": "look"}]
    imgs = [
        ImagePart(data=b"a", media_type="image/png"),
        ImagePart(data=b"b", media_type="image/png"),
        ImagePart(data=b"c", media_type="image/png"),
    ]
    _attach_images_to_last_user(msgs, imgs)
    parts = msgs[0]["content"]
    image_parts = [p for p in parts if p["type"] == "image_url"]
    assert len(image_parts) == 3
    # Order preserved: decode the base64 URLs and confirm.
    for expected, part in zip([b"a", b"b", b"c"], image_parts):
        encoded = base64.b64encode(expected).decode("ascii")
        assert part["image_url"]["url"].endswith(encoded)


def test_attach_images_only_modifies_last_user_message() -> None:
    msgs = [
        {"role": "user", "content": "first turn"},
        {"role": "assistant", "content": "ok"},
        {"role": "user", "content": "now look at this"},
    ]
    _attach_images_to_last_user(
        msgs, [ImagePart(data=b"x", media_type="image/png")]
    )
    assert msgs[0]["content"] == "first turn"  # untouched
    assert isinstance(msgs[2]["content"], list)


def test_attach_images_creates_user_message_when_none_exists() -> None:
    """Edge case — no prior user turn (shouldn't happen in practice)."""
    msgs = [{"role": "system", "content": "sys"}]
    _attach_images_to_last_user(
        msgs, [ImagePart(data=b"x", media_type="image/png")]
    )
    assert len(msgs) == 2
    assert msgs[-1]["role"] == "user"
    assert isinstance(msgs[-1]["content"], list)
    assert msgs[-1]["content"][0]["type"] == "image_url"


def test_attach_images_with_empty_text_does_not_emit_text_part() -> None:
    msgs = [{"role": "user", "content": ""}]
    _attach_images_to_last_user(
        msgs, [ImagePart(data=b"x", media_type="image/png")]
    )
    parts = msgs[0]["content"]
    # No text part because the original content was empty.
    assert all(p["type"] != "text" for p in parts)
    assert any(p["type"] == "image_url" for p in parts)


def test_attach_images_preserves_existing_list_content() -> None:
    """If the user message is already a list (e.g. from a previous attach),
    new images should append without disturbing existing parts."""
    msgs = [
        {
            "role": "user",
            "content": [{"type": "text", "text": "look"}],
        }
    ]
    _attach_images_to_last_user(
        msgs, [ImagePart(data=b"x", media_type="image/png")]
    )
    parts = msgs[0]["content"]
    assert parts[0] == {"type": "text", "text": "look"}
    assert parts[1]["type"] == "image_url"
