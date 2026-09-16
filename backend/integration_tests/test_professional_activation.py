"""Loopback HTTP journey across real services, with disposable SQLite and file-store double.

Run separately from service suites: python -m pytest backend/integration_tests -q.
These checks do not establish PostgreSQL locking or production storage acceptance.
"""

import os
import socket
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest

BACKEND = Path(__file__).resolve().parents[1]
JWT_SECRET = "isolated-activation-integration-jwt-2026"
PASSWORD = "Local-activation-test-2026!"


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture(scope="module")
def services(tmp_path_factory):
    directory = tmp_path_factory.mktemp("activation-http")
    names = ("user", "doctor", "nurse", "onboarding")
    ports = {name: free_port() for name in names}
    urls = {name: f"http://127.0.0.1:{ports[name]}" for name in names}
    env = {
        **os.environ,
        "USER_PUBLISH_EVENTS": "false",
        "ONBOARDING_ACTIVATION_ENABLED": "true",
        "ONBOARDING_ACTIVATION_POLL_SECONDS": "1",
        "ONBOARDING_JWT_ISSUER": "medapp",
        "MEDAPP_DEFAULT_JWT_SECRET": JWT_SECRET,
        "MEDAPP_DEFAULT_JWT_ISSUER": "medapp",
        "MEDAPP_DEFAULT_JWT_AUDIENCE": "medapp.platform",
        "PYTHONUTF8": "1",
    }
    for name in names:
        env[f"{name.upper()}_DATABASE_URL"] = (
            "sqlite+aiosqlite:///" + (directory / f"{name}.db").as_posix()
        )
        env[f"{name.upper()}_JWT_SECRET"] = JWT_SECRET
        env[f"{name.upper()}_LOG_LEVEL"] = "WARNING"
        if name != "onboarding":
            secret = f"isolated-{name}-activation-server-secret-2026"
            env[f"{name.upper()}_ONBOARDING_ACTIVATION_SECRET"] = secret
            env[f"ONBOARDING_ACTIVATION_{name.upper()}_SECRET"] = secret
            env[f"ONBOARDING_ACTIVATION_{name.upper()}_URL"] = urls[name]
    children, logs = [], []
    try:
        for name in names:
            output = (directory / f"{name}.log").open("w", encoding="utf-8")
            logs.append(output)
            children.append(
                subprocess.Popen(
                    [
                        sys.executable,
                        str(Path(__file__).with_name("activation_server.py")),
                        name,
                        str(ports[name]),
                    ],
                    env=env,
                    stdout=output,
                    stderr=subprocess.STDOUT,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
                )
            )
        with httpx.Client(timeout=10, trust_env=False) as client:
            deadline = time.monotonic() + 45
            pending = set(names)
            while pending and time.monotonic() < deadline:
                for name in list(pending):
                    try:
                        if client.get(urls[name] + "/healthz").status_code == 200:
                            pending.remove(name)
                    except httpx.RequestError:
                        pass
                if pending:
                    time.sleep(0.2)
            assert not pending, f"Services did not start: {sorted(pending)}; inspect {directory}"
            yield client, urls, directory
    finally:
        for child in children:
            if child.poll() is None:
                child.terminate()
        for child in children:
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=10)
        for output in logs:
            output.close()


def json_response(response, status=200):
    assert response.status_code == status, response.text
    return response.json()


def login(client, user_url, email):
    return json_response(
        client.post(
            user_url + "/auth/login",
            json={"email": email, "password": PASSWORD},
            headers={"X-Device-Id": email},
        )
    )


@pytest.mark.parametrize("role", ["doctor", "nurse"])
def test_approved_applicant_can_refresh_and_edit_own_profile(services, role):
    client, urls, directory = services
    applicant_email, admin_email = (
        f"{role}@activation.example",
        f"reviewer-{role}@activation.example",
    )
    for email in (applicant_email, admin_email):
        json_response(
            client.post(
                urls["user"] + "/auth/signup",
                json={
                    "email": email,
                    "password": PASSWORD,
                    "first_name": "QA",
                    "last_name": "Applicant",
                },
            ),
            201,
        )
    # Explicit QA setup: public signup cannot grant admin. This only changes the
    # disposable account in this test's own user database before a real login.
    with sqlite3.connect(directory / "user.db") as db:
        db.execute("UPDATE users SET role='admin' WHERE email=?", (admin_email,))
    applicant = login(client, urls["user"], applicant_email)
    admin = login(client, urls["user"], admin_email)
    owner_headers = {"Authorization": "Bearer " + applicant["access_token"]}
    admin_headers = {"Authorization": "Bearer " + admin["access_token"]}
    profile_url = urls[role] + f"/v1/{role}s/me"
    assert client.get(profile_url, headers=owner_headers).status_code == 403
    root = urls["onboarding"] + "/v1/onboarding/applications"
    application = json_response(
        client.post(
            root,
            headers=owner_headers,
            json={
                "partner_type": "practitioner",
                "practitioner_role": role,
                "professional_first_name": "QA",
                "professional_last_name": "Clinician",
                "legal_name": "QA Clinician",
                "license_number": "QA-LICENSE-2026",
                "country": "GH",
                "city": "Accra",
                "email": applicant_email,
                "phone": "+233200000000",
                "specialty": "General practice",
            },
        ),
        201,
    )
    application_url = root + "/" + application["application_id"]
    for kind in ("medical_license" if role == "doctor" else "nursing_license", "government_id"):
        application = json_response(
            client.post(
                application_url + "/documents/upload",
                params={"kind": kind},
                headers={
                    **owner_headers,
                    "If-Match": str(application["version"]),
                    "Content-Type": "application/pdf",
                },
                content=b"%PDF-1.7\nSynthetic test credential\n%%EOF",
            )
        )
    application = json_response(
        client.post(
            application_url + "/submit",
            headers={**owner_headers, "If-Match": str(application["version"])},
            json={
                "attestation_accepted": True,
                "attestation_version": "professional-application-v1",
            },
        )
    )
    review_body = {
        "action": "approve",
        "verified_document_ids": [doc["document_id"] for doc in application["documents"]],
    }
    assert (
        client.post(
            application_url + "/review",
            headers={**owner_headers, "If-Match": str(application["version"])},
            json=review_body,
        ).status_code
        == 403
    )
    application = json_response(
        client.post(
            application_url + "/review",
            headers={**admin_headers, "If-Match": str(application["version"])},
            json=review_body,
        )
    )
    deadline = time.monotonic() + 25
    while time.monotonic() < deadline:
        activation = json_response(
            client.get(application_url + "/activation", headers=owner_headers)
        )
        if activation["state"] == "active":
            break
        assert activation["state"] in {"pending", "retry"}, activation
        time.sleep(0.2)
    assert activation["state"] == "active", activation
    # A previously issued patient token cannot authorize clinician actions.
    assert client.get(profile_url, headers=owner_headers).status_code == 403
    refreshed = json_response(
        client.post(
            urls["user"] + "/auth/refresh",
            json={"refresh_token": applicant["refresh_token"]},
            headers={"X-Device-Id": applicant_email},
        )
    )
    fresh_headers = {"Authorization": "Bearer " + refreshed["access_token"]}
    profile = json_response(client.get(profile_url, headers=fresh_headers))
    assert profile[f"{role}_id"] == activation["profile_id"]
    assert profile["first_name"] == "QA" and not profile["is_listable"]
    saved = json_response(
        client.patch(
            profile_url, headers=fresh_headers, json={"bio": "Updated by the activated account"}
        )
    )
    assert saved["bio"] == "Updated by the activated account"
    json_response(
        client.post(
            application_url + "/activation/retry",
            headers={**admin_headers, "If-Match": str(application["version"])},
        )
    )
    assert json_response(client.get(profile_url, headers=fresh_headers))["bio"] == saved["bio"]
    with sqlite3.connect(directory / f"{role}.db") as db:
        assert db.execute(f"SELECT count(*) FROM {role}_profiles").fetchone()[0] == 1
        assert (
            db.execute("SELECT count(*) FROM professional_activation_receipts").fetchone()[0] == 1
        )
