"""Audit finding B-4 regression: HMS must refuse to boot with dev_mode=true
in production.

The dev_auth router mints admin tokens for any patient — a misconfigured
production deploy must crash on startup, not silently expose the
endpoint.
"""
from __future__ import annotations

import importlib

import pytest


def _reload_hms_app(monkeypatch: pytest.MonkeyPatch, *, env: str | None, dev_mode: bool):
    """Re-import hms_service config and main with the given env settings."""
    if env is None:
        monkeypatch.delenv("ENV", raising=False)
    else:
        monkeypatch.setenv("ENV", env)
    monkeypatch.setenv("HMS_DEV_MODE", "true" if dev_mode else "false")
    # Force re-evaluation of pydantic settings + the create_app guard.
    import app.config
    import app.main
    importlib.reload(app.config)
    importlib.reload(app.main)
    return app.main


def test_dev_mode_in_production_refuses_to_boot(monkeypatch: pytest.MonkeyPatch) -> None:
    """Production + dev_mode=True → RuntimeError when create_app() runs.

    `app/main.py` has `app = create_app()` at module level, so the guard
    fires during the module reload itself — not on a later call.
    """
    with pytest.raises(RuntimeError) as exc:
        _reload_hms_app(monkeypatch, env="production", dev_mode=True)
    assert "dev_mode" in str(exc.value).lower()
    assert "production" in str(exc.value).lower()


def test_dev_mode_outside_production_is_allowed(monkeypatch: pytest.MonkeyPatch) -> None:
    """Local dev / CI / staging can run with dev_mode=True (just logs a warning)."""
    main_mod = _reload_hms_app(monkeypatch, env=None, dev_mode=True)
    # Should NOT raise.
    app = main_mod.create_app()
    assert app is not None


def test_production_without_dev_mode_is_allowed(monkeypatch: pytest.MonkeyPatch) -> None:
    """The guard only triggers on the combination — production with dev_mode
    off boots cleanly."""
    main_mod = _reload_hms_app(monkeypatch, env="production", dev_mode=False)
    app = main_mod.create_app()
    assert app is not None
