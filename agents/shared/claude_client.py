"""Anthropic client factory.

We default to claude-opus-4-7 with adaptive thinking. The client is cached per
process so we don't re-create connections on every request.
"""
from __future__ import annotations

from functools import lru_cache

import anthropic


@lru_cache(maxsize=1)
def get_claude_client() -> anthropic.Anthropic:
    return anthropic.Anthropic()


@lru_cache(maxsize=1)
def get_async_claude_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic()
