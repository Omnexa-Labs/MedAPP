# ADR 0006 — Vision support in `LLMProvider`

- **Status**: Accepted
- **Date**: 2026-05-22

## Context

`lab_reader_agent` reads photos of lab reports and prescriptions. Its
extraction pipeline needs to send an image plus a structured-output
prompt to a vision-capable LLM and parse the result. The existing
`LLMProvider.run()` signature is text-only:

```python
def run(*, system_prompt, messages, tools, executor, max_tokens) -> LLMResult
```

Three integration options:

1. **Inline base64 in the user message text** (`"This image: data:..."`).
   Ugly. Hits per-provider token limits in unintuitive ways.
2. **Separate `run_vision()` method on `LLMProvider`.** Two parallel
   surfaces; non-vision providers leave it unimplemented.
3. **Extend `run()` with an optional `images` parameter.** Backwards
   compatible default of `None`; providers translate as needed.

Future agents may want vision too — `medical_chat` could accept rash
photos; `vitals_watcher` could read a manual blood-pressure cuff
display.

## Decision

**Option 3.** Add `images: list[ImagePart] | None = None` to
`LLMProvider.run()`. `ImagePart` is a small dataclass: `data: bytes`,
`media_type: str`, `detail: str = "auto"`.

Translation rules per provider:

- **`OpenAICompatProvider`** (Groq + OpenAI). Converts the most recent
  user message's `content` from a string into the multimodal list form
  and appends each `ImagePart` as
  `{"type": "image_url", "image_url": {"url": "data:..."}}`.
- **`MockLLM`**. Accepts and ignores images; surfaces a
  `(mock) saw N image(s)` debug line so vision-path tests can assert
  wiring without a real provider.
- **Other providers (future)**. Raise `NotImplementedError` on non-empty
  `images`. The scan orchestrator catches this and returns a
  low-confidence empty result — the agent stays up.

The translation helpers (`_attach_images_to_last_user`, `_image_to_part`)
are module-level and unit-tested in
`agents/tests/test_vision_translation.py` — pinning the OpenAI multimodal
shape against silent format changes.

## Consequences

- **Good.** Zero churn for existing agents. `concierge`, `medical_chat`,
  `smart_recommend`, `vitals_watcher` call `run()` exactly as before;
  the default `images=None` keeps them text-only.
- **Good.** Provider opt-in. New text-only providers (e.g. a local
  llama.cpp) can keep raising on vision without owning a half-implemented
  feature.
- **Cost.** The Protocol surface grows by one parameter. Anyone
  implementing `LLMProvider` from scratch must remember to handle (or
  raise on) the new argument.
- **Cost.** Vision is currently base64-in-body. For real PHI uploads we
  should move to GCS reference + signed URL; that's a slice-2 concern for
  `lab_reader_agent` and doesn't change this protocol.
