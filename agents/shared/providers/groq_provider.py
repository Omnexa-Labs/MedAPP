"""Groq provider.

Groq exposes an OpenAI-compatible API at `https://api.groq.com/openai/v1`.
Same tool-calling shape, same chat-completions shape, different model
catalogue. Default: `llama-3.3-70b-versatile`.

**Not HIPAA-covered.** ADR 0004's env guard (`ENV=production` + `groq` →
startup fail) lives in `agents/shared/llm.py::make_provider`.
"""
from __future__ import annotations

from .openai_compat import OpenAICompatProvider


class GroqProvider(OpenAICompatProvider):
    env_key_var = "GROQ_API_KEY"
    default_base_url = "https://api.groq.com/openai/v1"
    default_model = "llama-3.3-70b-versatile"
