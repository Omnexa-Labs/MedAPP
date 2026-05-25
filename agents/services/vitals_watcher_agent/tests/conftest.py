"""Set agent config via env before app.main is imported.

Memory disabled, AMQP URL empty (subscriber + publisher both no-op),
JWT secret fixed so tests can mint valid tokens.
"""
import os

os.environ.setdefault("MEMORY_DISABLED", "true")
os.environ.pop("QDRANT_URL", None)
os.environ.pop("VITALS_WATCHER_AMQP_URL", None)
# Notification dispatch disabled — same reason as smart_recommend. Tests that
# verify the notify path inject their own dispatcher into AnomalyDispatcher.
os.environ["VITALS_WATCHER_NOTIFICATION_SERVICE_URL"] = ""

TEST_JWT_SECRET = "vitals-watcher-pytest-secret-padded-to-32-bytes-for-hs256"
os.environ.setdefault("VITALS_WATCHER_JWT_SECRET", TEST_JWT_SECRET)


def auth_header(patient_id: str = "p1", role: str = "patient") -> dict[str, str]:
    from agents.shared import issue_test_token

    token = issue_test_token(patient_id, secret=TEST_JWT_SECRET, role=role)
    return {"Authorization": f"Bearer {token}"}
