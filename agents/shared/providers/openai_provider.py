"""OpenAI provider.

Works against vanilla OpenAI or Azure OpenAI — set `OPENAI_BASE_URL` to point
at your Azure resource (`https://<name>.openai.azure.com/openai/v1`). Default
model: `gpt-4.1-mini`.

OpenAI under BAA is the intended *production* provider for PHI workloads
(ADR 0004).
"""
from __future__ import annotations

from .openai_compat import OpenAICompatProvider


class OpenAIProvider(OpenAICompatProvider):
    env_key_var = "OPENAI_API_KEY"
    default_base_url = None  # SDK default
    default_model = "gpt-4.1-mini"
