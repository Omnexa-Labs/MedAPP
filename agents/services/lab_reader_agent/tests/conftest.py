"""Set agent config via env before app.main is imported."""
import os

os.environ.setdefault("MEMORY_DISABLED", "true")
os.environ.pop("QDRANT_URL", None)

TEST_JWT_SECRET = "lab-reader-pytest-secret-padded-to-32-bytes-for-hs256"
os.environ.setdefault("LAB_READER_JWT_SECRET", TEST_JWT_SECRET)


def auth_header(patient_id: str = "p1", role: str = "patient") -> dict[str, str]:
    from agents.shared import issue_test_token

    token = issue_test_token(patient_id, secret=TEST_JWT_SECRET, role=role)
    return {"Authorization": f"Bearer {token}"}
