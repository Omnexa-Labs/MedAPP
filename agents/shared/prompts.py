"""Locate the agent prompt markdown in `agents/prompts/`.

Agent modules must NOT find this directory by walking up from their own
`__file__`, which is what every call site used to do and why all six agent
containers crashed on import:

    Path(__file__).resolve().parents[3] / "prompts" / "concierge.md"

That walk is correct in the repo, where an agent module sits four levels below
`agents/` (`agents/services/<name>/app/agent.py`). It is wrong in the image,
because each service Dockerfile copies only its own `app` directory:

    COPY agents/prompts               /app/agents/prompts
    COPY agents/services/<name>/app   /app/app

so `agent.py` lands at `/app/app/agent.py` with just three parents
(`/app/app`, `/app`, `/`) and `parents[3]` raises `IndexError: 3` — at import
time, so the container exits 1 before uvicorn ever binds.

Resolving from THIS module instead is correct in both layouts. `agents/shared/`
keeps its position relative to `agents/prompts/` everywhere it exists — the repo
has `agents/shared` + `agents/prompts`, the image has `/app/agents/shared` +
`/app/agents/prompts` — so `prompts/` is always a sibling of this file's parent,
whatever the service-level nesting happens to be.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts"


def prompt_path(name: str) -> Path:
    """Path to a prompt file. Does not check that it exists.

    For callers that tolerate a missing prompt and want the path for a log
    message; callers that need the text should use `load_prompt`.
    """
    return PROMPTS_DIR / name


@lru_cache(maxsize=None)
def load_prompt(name: str) -> str:
    """Read a prompt file, caching by name.

    Raises `OSError` if the file is missing. That is deliberate for the persona
    prompts loaded at import time: an agent with no system prompt is a broken
    build, and failing at startup is easier to diagnose than an agent that runs
    with an empty prompt and answers badly.
    """
    return prompt_path(name).read_text(encoding="utf-8")
