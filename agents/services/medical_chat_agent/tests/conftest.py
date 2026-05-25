"""Set agent config via env before app.main is imported.

Memory disabled to skip Qdrant; JWT secret fixed so tests can mint valid
tokens via the helper below.
"""
import os

os.environ.setdefault("MEMORY_DISABLED", "true")
os.environ.pop("QDRANT_URL", None)

TEST_JWT_SECRET = "medical-chat-pytest-secret-padded-to-32-bytes-for-hs256"
os.environ.setdefault("MEDICAL_CHAT_JWT_SECRET", TEST_JWT_SECRET)


def auth_header(patient_id: str = "p1", role: str = "patient") -> dict[str, str]:
    from agents.shared import issue_test_token

    token = issue_test_token(patient_id, secret=TEST_JWT_SECRET, role=role)
    return {"Authorization": f"Bearer {token}"}
