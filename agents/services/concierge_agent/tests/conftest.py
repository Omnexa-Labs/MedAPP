"""Test fixtures for concierge agent.

Set agent config via env *before* `app.main` is imported — the agent
constructs its memory service and JWT validator at module load time, so
the env must be present at collection time.
"""
import os

os.environ.setdefault("MEMORY_DISABLED", "true")
os.environ.pop("QDRANT_URL", None)

# A fixed test secret so tests can mint valid JWTs. Real deployments
# override CONCIERGE_JWT_SECRET via env.
TEST_JWT_SECRET = "concierge-pytest-secret-padded-to-32-bytes-for-hs256"
os.environ.setdefault("CONCIERGE_JWT_SECRET", TEST_JWT_SECRET)


def auth_header(patient_id: str = "p1", role: str = "patient") -> dict[str, str]:
    """Mint a Bearer header for a test request.

    Imports `issue_test_token` lazily so this file can be collected before
    the agents package is importable (matches existing layout).
    """
    from agents.shared import issue_test_token

    token = issue_test_token(patient_id, secret=TEST_JWT_SECRET, role=role)
    return {"Authorization": f"Bearer {token}"}
