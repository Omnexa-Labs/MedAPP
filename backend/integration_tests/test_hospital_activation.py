"""Real HTTP and PostgreSQL hospital approval/session journey.

Opt in with HMS_TEST_POSTGRES=1. Uses disposable databases in one postgres:16
container, loopback services, and an in-memory private document store. No existing
accounts, databases, deployment configuration, or external credentials are used.
"""

import os
import socket
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from uuid import NAMESPACE_URL, uuid4, uuid5

import httpx
import psycopg
import pytest
from psycopg import sql
from sqlalchemy.engine import make_url

BACKEND = Path(__file__).resolve().parents[1]
JWT_SECRET = "isolated-hospital-platform-jwt-secret-2026"
HMS_SECRET = "isolated-hospital-workspace-jwt-secret-2026"
HANDOFF_SECRET = "isolated-hospital-browser-handoff-secret-2026"
DIRECTORY_SECRET = "isolated-hospital-directory-management-secret-2026"
PASSWORD = "Local-hospital-test-2026!"
LEGACY_HOSPITAL = uuid4()


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def result(response, status=200):
    assert response.status_code == status, response.text
    return response.json()


@pytest.fixture(scope="module")
def postgres():
    if os.getenv("HMS_TEST_POSTGRES") != "1":
        pytest.skip("set HMS_TEST_POSTGRES=1 for disposable PostgreSQL validation")
    # A Linux test runner can share the network namespace of a separately owned,
    # disposable PostgreSQL container. Its launcher owns teardown; no host volume
    # or published database port is needed. Never point this at a retained server.
    supplied = os.getenv("MEDAPP_TEST_POSTGRES_URL")
    if supplied:
        parsed = make_url(supplied)
        assert parsed.drivername == "postgresql" and parsed.host in {"localhost", "127.0.0.1"}
        assert parsed.database == "postgres" and parsed.username == "postgres"
        with psycopg.connect(supplied, connect_timeout=2) as db:
            assert db.execute("SELECT 1").fetchone() == (1,)
        yield supplied
        return
    name = "medapp-hospital-qa-" + uuid4().hex[:12]
    password = uuid4().hex
    try:
        subprocess.run(
            [
                "docker",
                "run",
                "--detach",
                "--rm",
                "--name",
                name,
                "--publish",
                "127.0.0.1::5432",
                "--env",
                "POSTGRES_PASSWORD=" + password,
                "postgres:16",
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=60,
        )
        mapping = subprocess.run(
            ["docker", "port", name, "5432/tcp"],
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        ).stdout.strip()
        assert mapping.startswith("127.0.0.1:")
        url = f"postgresql://postgres:{password}@{mapping}/postgres"
        deadline = time.monotonic() + 30
        while True:
            try:
                with psycopg.connect(url, connect_timeout=2) as db:
                    assert db.execute("SELECT 1").fetchone() == (1,)
                break
            except psycopg.OperationalError:
                if time.monotonic() >= deadline:
                    raise RuntimeError("disposable PostgreSQL did not become ready") from None
                time.sleep(0.2)
        yield url
    finally:
        subprocess.run(["docker", "rm", "--force", name], capture_output=True, timeout=30)


def migrate(name, env, *arguments):
    directory = BACKEND / "services" / f"{name}_service"
    environment = {**env, "PYTHONPATH": os.pathsep.join([str(BACKEND / "shared"), str(directory)])}
    config = "alembic_mgmt.ini" if name == "hms" else "alembic.ini"
    return subprocess.run(
        [sys.executable, "-m", "alembic", "-c", config, *arguments],
        cwd=directory,
        env=environment,
        capture_output=True,
        text=True,
        timeout=45,
    )


@pytest.fixture(scope="module")
def services(postgres, tmp_path_factory):
    directory = tmp_path_factory.mktemp("hospital-http-postgres")
    names = ("user", "hospital", "hms", "onboarding", "api_gateway")
    ports = {name: free_port() for name in names}
    urls = {name: f"http://127.0.0.1:{ports[name]}" for name in names}
    parsed = make_url(postgres)
    env = {
        **os.environ,
        "PYTHONUTF8": "1",
        "MEDAPP_TEST_MIGRATED": "1",
        "USER_PUBLISH_EVENTS": "false",
        "USER_HMS_HANDOFF_SECRET": HANDOFF_SECRET,
        "USER_HMS_WEB_ORIGIN": "https://hospital.example",
        "USER_HMS_RETURN_URIS": "medapp://hospital-workspaces",
        "ONBOARDING_ACTIVATION_ENABLED": "true",
        "ONBOARDING_ACTIVATION_POLL_SECONDS": "1",
        "ONBOARDING_JWT_ISSUER": "medapp",
        "HMS_DEV_MODE": "false",
        "HMS_WORKSPACE_SESSION_SECRET": HMS_SECRET,
        "HMS_USER_SERVICE_URL": urls["user"],
        "HMS_HOSPITAL_SERVICE_URL": urls["hospital"],
        "HMS_HOSPITAL_DIRECTORY_SECRET": DIRECTORY_SECRET,
        "HOSPITAL_HMS_DIRECTORY_SECRET": DIRECTORY_SECRET,
        "HMS_ADMIN_DATABASE_URL_SYNC": postgres,
        "HMS_TENANT_DATABASE_URL_TEMPLATE": parsed.set(
            drivername="postgresql+asyncpg", database="hms_{tenant_slug}"
        ).render_as_string(hide_password=False),
        "GW_JWT_SECRET": JWT_SECRET,
        "GW_HMS_WORKSPACE_SESSION_SECRET": HMS_SECRET,
        "GW_USER_SERVICE_URL": urls["user"],
        "GW_HMS_SERVICE_URL": urls["hms"],
        "GW_HOSPITAL_SERVICE_URL": urls["hospital"],
        "MEDAPP_DEFAULT_JWT_SECRET": JWT_SECRET,
        "MEDAPP_DEFAULT_JWT_ISSUER": "medapp",
        "MEDAPP_DEFAULT_JWT_AUDIENCE": "medapp.platform",
    }
    databases, secrets = {}, {}
    for name in names[:-1]:
        database = "qa_" + name + "_" + uuid4().hex
        with psycopg.connect(postgres, autocommit=True) as db:
            db.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database)))
        databases[name] = parsed.set(database=database).render_as_string(hide_password=False)
        key = "HMS_MGMT_DATABASE_URL" if name == "hms" else name.upper() + "_DATABASE_URL"
        env[key] = parsed.set(drivername="postgresql+asyncpg", database=database).render_as_string(
            hide_password=False
        )
        env[name.upper() + "_JWT_SECRET"] = JWT_SECRET
        env[name.upper() + "_LOG_LEVEL"] = "WARNING"
        if name != "onboarding":
            secrets[name] = f"isolated-{name}-hospital-activation-secret-2026"
            env[name.upper() + "_ONBOARDING_ACTIVATION_SECRET"] = secrets[name]
            env["ONBOARDING_ACTIVATION_" + name.upper() + "_SECRET"] = secrets[name]
            env["ONBOARDING_ACTIVATION_" + name.upper() + "_URL"] = urls[name]
        if name == "hospital":
            migration = migrate(name, env, "upgrade", "20260805_0003")
            assert migration.returncode == 0, migration.stderr
            with psycopg.connect(databases[name]) as db:
                db.execute(
                    "INSERT INTO hospital_profiles (id, name, slug, insurance_accepted, accreditation_status, is_active) "
                    "VALUES (%s, 'Legacy hospital', 'legacy-hospital', '[]', 'approved', true)",
                    (LEGACY_HOSPITAL,),
                )
        migration = migrate(name, env, "upgrade", "head")
        assert migration.returncode == 0, migration.stderr
    children, logs = [], []
    try:
        with httpx.Client(timeout=45, trust_env=False) as client:
            # Start each dependency before the next one. Five simultaneous cold
            # Python imports can exhaust startup time on resource-limited hosts.
            for name in names:
                output = (directory / f"{name}.log").open("w", encoding="utf-8")
                logs.append(output)
                child = subprocess.Popen(
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
                children.append(child)
                deadline, ready = time.monotonic() + 45, False
                while time.monotonic() < deadline:
                    assert child.poll() is None, (
                        f"{name} exited during startup; inspect {directory}"
                    )
                    try:
                        health = client.get(urls[name] + "/healthz", timeout=2)
                        if health.status_code == 200:
                            if name == "api_gateway":
                                assert health.json()["service"] == "api-gateway"
                            ready = True
                            break
                    except httpx.RequestError:
                        pass
                    time.sleep(0.2)
                assert ready, f"{name} failed to start; inspect {directory}"
            yield client, urls, databases, secrets, env
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


def account(client, urls, databases, *, admin=False):
    email = f"qa-{uuid4().hex}@hospital.example"
    result(
        client.post(
            urls["user"] + "/auth/signup",
            json={
                "email": email,
                "password": PASSWORD,
                "first_name": "QA",
                "last_name": "Owner",
            },
        ),
        201,
    )
    # Only the disposable QA account is promoted, outside the public signup API.
    if admin:
        with psycopg.connect(databases["user"]) as db:
            db.execute("UPDATE users SET role='admin' WHERE email=%s", (email,))
    login = result(
        client.post(
            urls["user"] + "/auth/login",
            json={
                "email": email,
                "password": PASSWORD,
            },
            headers={"X-Device-Id": email},
        )
    )
    headers = {"Authorization": "Bearer " + login["access_token"]}
    identity = result(client.get(urls["user"] + "/me", headers=headers))
    return email, headers, identity


def test_approval_creates_private_hospital_and_owner_can_use_scoped_workspace(services):
    client, urls, databases, secrets, _ = services
    email, owner, identity = account(client, urls, databases)
    _, reviewer, _ = account(client, urls, databases, admin=True)
    root = urls["onboarding"] + "/v1/onboarding/applications"
    application = result(
        client.post(
            root,
            headers=owner,
            json={
                "partner_type": "hospital",
                "onboarding_mode": "facility",
                "legal_name": "QA Approved Hospital",
                "display_name": "QA Hospital",
                "license_number": "QA-HOSPITAL-2026",
                "registration_number": "QA-REG-2026",
                "address_line1": "1 Hospital Road",
                "country": "GH",
                "city": "Accra",
                "email": email,
                "phone": "+233200000000",
            },
        ),
        201,
    )
    application_url = root + "/" + application["application_id"]
    for kind in ("hospital_license", "registration_certificate"):
        application = result(
            client.post(
                application_url + "/documents/upload",
                params={"kind": kind},
                headers={
                    **owner,
                    "If-Match": str(application["version"]),
                    "Content-Type": "application/pdf",
                },
                content=b"%PDF-1.7\nSynthetic QA credential\n%%EOF",
            )
        )
    application = result(
        client.post(
            application_url + "/submit",
            headers={**owner, "If-Match": str(application["version"])},
            json={
                "attestation_accepted": True,
                "attestation_version": "professional-application-v1",
            },
        )
    )
    application = result(
        client.post(
            application_url + "/review",
            headers={**reviewer, "If-Match": str(application["version"])},
            json={
                "action": "approve",
                "verified_document_ids": [doc["document_id"] for doc in application["documents"]],
            },
        )
    )
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        activation = result(client.get(application_url + "/activation", headers=owner))
        if activation["state"] == "active":
            break
        assert activation["state"] in {"pending", "retry"}, activation
        time.sleep(0.2)
    assert activation["state"] == "active", activation
    hospital_id = activation["profile_id"]
    assert result(client.get(urls["user"] + "/me", headers=owner))["role"] == identity["role"]
    assert client.get(urls["hospital"] + "/v1/hospitals/" + hospital_id).status_code == 404
    gateway = urls["api_gateway"] + "/v1/hms"
    workspaces = result(client.get(gateway + "/auth/workspaces", headers=owner))
    assert workspaces == [
        {"hospital_id": hospital_id, "hospital_name": "QA Hospital", "hms_role": "hospital_admin"}
    ]
    assert result(client.get(gateway + "/auth/workspaces", headers=reviewer)) == []
    broker = urls["api_gateway"] + "/v1/auth/hospital-handoffs"
    issued = result(
        client.post(
            broker,
            headers={**owner, "X-Device-Id": email},
            json={
                "return_uri": "medapp://hospital-workspaces",
                "return_state": "s" * 32,
            },
        )
    )
    proof = parse_qs(urlsplit(issued["url"]).fragment)["code"][0]
    server_headers = {"X-Hms-Handoff-Secret": HANDOFF_SECRET, "X-Device-Id": "b" * 64}
    preview = result(client.post(broker + "/inspect", headers=server_headers, json={"code": proof}))
    assert preview["user_id"] == identity["id"] and "tokens" not in preview
    web_session = result(
        client.post(broker + "/redeem", headers=server_headers, json={"code": proof})
    )
    assert web_session["destination"] == "/workspaces"
    assert (
        client.post(broker + "/redeem", headers=server_headers, json={"code": proof}).status_code
        == 410
    )
    browser = {"Authorization": "Bearer " + web_session["tokens"]["access_token"]}
    assert (
        result(client.get(urls["api_gateway"] + "/v1/me", headers=browser))["role"]
        == identity["role"]
    )
    assert result(client.get(gateway + "/auth/workspaces", headers=browser)) == workspaces
    session = result(
        client.post(
            gateway + "/auth/workspace-session", headers=browser, json={"hospital_id": hospital_id}
        )
    )
    workspace_auth = {"Authorization": "Bearer " + session["access_token"]}
    profile_url = gateway + "/hospital-profile"
    directory_url = urls["api_gateway"] + "/v1/hospitals"

    def patient_directory(suffix="", **kwargs):
        # Directory fields are public, but the gateway requires a MedApp session.
        return client.get(directory_url + suffix, headers=owner, **kwargs)

    profile = result(client.get(profile_url, headers=workspace_auth))
    assert profile["hospital_id"] == hospital_id and not profile["is_listed"]
    assert client.get(profile_url, headers=owner).status_code == 401
    draft = result(
        client.patch(
            profile_url,
            headers=workspace_auth,
            json={
                "version": profile["version"],
                "changes": {"name": "Published QA Hospital", "insurance_accepted": ["NHIS", "Axa"]},
            },
        )
    )
    assert patient_directory("/" + hospital_id).status_code == 404
    published = result(
        client.post(
            profile_url + "/publish", headers=workspace_auth, json={"version": draft["version"]}
        )
    )
    assert published["published"]["name"] == "Published QA Hospital"
    public_details = result(patient_directory("/" + hospital_id))
    assert public_details["name"] == "Published QA Hospital"
    assert hospital_id in {
        row["hospital_id"]
        for row in result(patient_directory(params={"insurance": "axa"}))["items"]
    }
    assert hospital_id not in {
        row["hospital_id"] for row in result(patient_directory(params={"insurance": "Ax"}))["items"]
    }

    def competing_edit(index):
        return client.patch(
            profile_url,
            headers=workspace_auth,
            json={
                "version": published["version"],
                "changes": {"description": f"Concurrent draft {index}"},
            },
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        edits = list(pool.map(competing_edit, range(2)))
    assert sorted(edit.status_code for edit in edits) == [200, 409]
    latest = result(client.get(profile_url, headers=workspace_auth))
    assert latest["has_unpublished_changes"]
    assert result(patient_directory("/" + hospital_id)) == public_details
    assert (
        result(patient_directory("/" + hospital_id))["description"]
        != latest["draft"]["description"]
    )
    withdrawn = result(
        client.post(
            profile_url + "/withdraw", headers=workspace_auth, json={"version": latest["version"]}
        )
    )
    assert patient_directory("/" + hospital_id).status_code == 404
    assert hospital_id not in {row["hospital_id"] for row in result(patient_directory())["items"]}
    assert result(
        client.post(
            profile_url + "/publish", headers=workspace_auth, json={"version": withdrawn["version"]}
        )
    )["is_listed"]
    events = result(client.get(profile_url + "/history", headers=workspace_auth))["items"]
    assert [event["version"] for event in events] == [6, 5, 4, 3, 2]
    assert {event["actor_id"] for event in events} == {identity["id"]}
    with psycopg.connect(databases["hospital"]) as db:
        assert db.execute(
            "SELECT count(*) FROM hospital_directory_events WHERE hospital_id=%s", (hospital_id,)
        ).fetchone() == (5,)
    department = result(
        client.post(
            gateway + "/departments",
            headers=workspace_auth,
            json={"name": "General Care", "slug": "general-care"},
        ),
        201,
    )
    assert (
        result(client.get(gateway + "/departments", headers=workspace_auth))["items"][0][
            "department_id"
        ]
        == department["department_id"]
    )
    assert client.get(urls["api_gateway"] + "/v1/me", headers=workspace_auth).status_code == 401
    assert client.get(gateway + "/tenants", headers=workspace_auth).status_code == 401
    assert (
        client.post(
            urls["api_gateway"] + "/v1/auth/logout",
            json={
                "refresh_token": web_session["tokens"]["refresh_token"],
            },
        ).status_code
        == 204
    )
    assert (
        client.post(
            urls["api_gateway"] + "/v1/auth/refresh",
            headers={"X-Device-Id": "b" * 64},
            json={
                "refresh_token": web_session["tokens"]["refresh_token"],
            },
        ).status_code
        == 401
    )
    assert (
        client.post(
            broker,
            headers={**owner, "X-Device-Id": email},
            json={
                "return_uri": "medapp://hospital-workspaces",
                "return_state": "t" * 32,
            },
        ).status_code
        == 200
    )
    with psycopg.connect(databases["user"]) as db:
        db.execute("UPDATE users SET is_active=false WHERE id=%s", (identity["id"],))
    assert client.get(gateway + "/auth/workspaces", headers=owner).status_code == 401
    with psycopg.connect(databases["user"]) as db:
        db.execute("UPDATE users SET is_active=true WHERE id=%s", (identity["id"],))
    with psycopg.connect(databases["hms"]) as db:
        assert db.execute(
            "SELECT count(*) FROM professional_activation_receipts WHERE resource_id=%s",
            (hospital_id,),
        ).fetchone() == (1,)
        db.execute("UPDATE hms_staff_roles SET is_active=false WHERE tenant_id=%s", (hospital_id,))
    assert (
        client.post(
            gateway + "/auth/workspace-session", headers=owner, json={"hospital_id": hospital_id}
        ).status_code
        == 404
    )
    assert client.get(gateway + "/departments", headers=workspace_auth).status_code in {400, 403}
    assert (
        client.post(
            profile_url + "/withdraw", headers=workspace_auth, json={"version": 6}
        ).status_code
        == 404
    )
    assert result(patient_directory("/" + hospital_id))["name"] == "Published QA Hospital"
    with psycopg.connect(databases["onboarding"]) as db:
        command = db.execute(
            "SELECT command_json FROM application_activations WHERE application_id=%s",
            (application["application_id"],),
        ).fetchone()[0]
    replay = client.post(
        urls["hms"] + "/internal/hospital-activations",
        headers={"X-Activation-Secret": secrets["hms"]},
        json={**command, "hospital_id": hospital_id},
    )
    assert replay.status_code == 409


def test_concurrent_receiver_delivery_is_idempotent_and_keeps_workspace_data(services):
    client, urls, databases, secrets, _ = services
    application_id = uuid4()
    hospital_id = str(uuid5(NAMESPACE_URL, f"medapp:hospital-application:{application_id}"))
    command = {
        "application_id": str(application_id),
        "applicant_id": str(uuid4()),
        "reviewer_id": str(uuid4()),
        "approval_version": 8,
        "role": "hospital",
        "name": "Concurrent Hospital",
        "address_line1": "2 Hospital Road",
        "city": "Accra",
        "country": "GH",
        "contact_email": "qa@hospital.example",
        "contact_phone": "+233200000000",
    }
    for name in ("hospital", "hms"):
        body = {**command, "hospital_id": hospital_id} if name == "hms" else command

        def deliver(_, name=name, body=body):
            return result(
                client.post(
                    urls[name] + "/internal/hospital-activations",
                    headers={"X-Activation-Secret": secrets[name]},
                    json=body,
                )
            )

        with ThreadPoolExecutor(max_workers=3) as pool:
            replies = list(pool.map(deliver, range(3)))
        assert all(reply == replies[0] for reply in replies)
        assert replies[0]["resource_id"] == hospital_id
        with psycopg.connect(databases[name]) as db:
            assert db.execute(
                "SELECT count(*) FROM professional_activation_receipts WHERE resource_id=%s",
                (hospital_id,),
            ).fetchone() == (1,)
    with psycopg.connect(databases["hms"]) as db:
        target = db.execute(
            "SELECT database_url FROM tenant_registry WHERE id=%s", (hospital_id,)
        ).fetchone()[0]
        assert db.execute(
            "SELECT count(*) FROM hms_staff_roles WHERE tenant_id=%s", (hospital_id,)
        ).fetchone() == (1,)
    connection_url = (
        make_url(target).set(drivername="postgresql").render_as_string(hide_password=False)
    )
    with psycopg.connect(connection_url) as db:
        assert db.execute("SELECT version_num FROM alembic_version").fetchone() == (
            "20260520_0001",
        )
        db.execute("CREATE TABLE qa_preserved (value integer)")
        db.execute("INSERT INTO qa_preserved VALUES (7)")
    assert deliver(None)["resource_id"] == hospital_id
    with psycopg.connect(connection_url) as db:
        assert db.execute("SELECT value FROM qa_preserved").fetchone() == (7,)


def test_directory_migration_preserves_existing_listing_and_protects_new_ownership(services):
    client, urls, databases, _, env = services
    assert client.get(urls["hospital"] + "/v1/hospitals/" + str(LEGACY_HOSPITAL)).status_code == 200
    with psycopg.connect(databases["hospital"]) as db:
        assert db.execute(
            "SELECT owner_user_id, is_listable FROM hospital_profiles WHERE id=%s",
            (LEGACY_HOSPITAL,),
        ).fetchone() == (None, True)
        # A newly inserted profile uses the private default, unlike migrated legacy rows.
        db.execute(
            "INSERT INTO hospital_profiles (id, name, slug, insurance_accepted, accreditation_status, is_active) VALUES (%s, 'Private default', 'private-default', '[]', 'pending', true)",
            (uuid4(),),
        )
        assert db.execute(
            "SELECT is_listable FROM hospital_profiles WHERE slug='private-default'"
        ).fetchone() == (False,)
    downgrade = migrate("hospital", env, "downgrade", "20260805_0003")
    assert downgrade.returncode != 0 and "cannot discard hospital" in downgrade.stderr
    with psycopg.connect(databases["hospital"]) as db:
        assert db.execute("SELECT version_num FROM alembic_version").fetchone() == (
            "20260915_0005",
        )


def test_management_migration_cannot_discard_activation_receipts(services):
    _, _, databases, _, env = services
    receipt = uuid4()
    with psycopg.connect(databases["hms"]) as db:
        db.execute(
            "INSERT INTO professional_activation_receipts (id, applicant_id, request_hash, role, resource_id) "
            "VALUES (%s, %s, %s, 'hospital', %s)",
            (receipt, uuid4(), "a" * 64, uuid4()),
        )
    downgrade = migrate("hms", env, "downgrade", "20260520_0001")
    assert downgrade.returncode != 0 and "cannot discard activation receipts" in downgrade.stderr
    with psycopg.connect(databases["hms"]) as db:
        assert db.execute(
            "SELECT id FROM professional_activation_receipts WHERE id=%s", (receipt,)
        ).fetchone() == (receipt,)
        assert db.execute("SELECT version_num FROM alembic_version").fetchone() == (
            "20260915_0003",
        )


def test_concurrent_hospital_proof_redemption_creates_one_browser_session(services):
    client, urls, databases, _, _ = services
    email, owner, identity = account(client, urls, databases)
    broker = urls["api_gateway"] + "/v1/auth/hospital-handoffs"
    issued = result(
        client.post(
            broker,
            headers={**owner, "X-Device-Id": email},
            json={
                "return_uri": "medapp://hospital-workspaces",
                "return_state": "c" * 32,
            },
        )
    )
    proof = parse_qs(urlsplit(issued["url"]).fragment)["code"][0]

    def redeem(_):
        return client.post(
            broker + "/redeem",
            headers={"X-Hms-Handoff-Secret": HANDOFF_SECRET, "X-Device-Id": "c" * 64},
            json={"code": proof},
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        replies = list(pool.map(redeem, range(2)))
    assert sorted(reply.status_code for reply in replies) == [200, 410]
    with psycopg.connect(databases["user"]) as db:
        assert db.execute(
            "SELECT count(*) FROM refresh_tokens WHERE user_id=%s AND device_id=%s AND revoked_at IS NULL",
            (identity["id"], "c" * 64),
        ).fetchone() == (1,)
        assert db.execute(
            "SELECT portal FROM partner_handoffs WHERE id=%s", (issued["handoff_id"],)
        ).fetchone() == ("hospital",)
        assert db.execute("SELECT version_num FROM alembic_version").fetchone() == (
            "20260914_0010",
        )


def test_staff_invitation_concurrent_join_scoped_access_and_reinvitation(services):
    client, urls, databases, secrets, _ = services
    email, owner, owner_identity = account(client, urls, databases)
    staff_email, recipient, staff_identity = account(client, urls, databases)
    _, unrelated, _ = account(client, urls, databases)
    application_id = uuid4()
    hospital_id = str(uuid5(NAMESPACE_URL, f"medapp:hospital-application:{application_id}"))
    result(
        client.post(
            urls["hms"] + "/internal/hospital-activations",
            headers={"X-Activation-Secret": secrets["hms"]},
            json={
                "application_id": str(application_id),
                "hospital_id": hospital_id,
                "applicant_id": owner_identity["id"],
                "reviewer_id": str(uuid4()),
                "approval_version": 1,
                "role": "hospital",
                "name": "Staff Onboarding Hospital",
                "address_line1": "3 Hospital Road",
                "city": "Accra",
                "country": "GH",
                "contact_email": email,
                "contact_phone": "+233200000000",
            },
        )
    )
    gateway = urls["api_gateway"] + "/v1/hms"
    exchanged = result(
        client.post(
            gateway + "/auth/workspace-session", headers=owner, json={"hospital_id": hospital_id}
        )
    )
    admin = {"Authorization": "Bearer " + exchanged["access_token"]}
    department = result(
        client.post(
            gateway + "/departments",
            headers=admin,
            json={"name": "Staff ward", "slug": "staff-ward"},
        ),
        201,
    )
    invitation = result(
        client.post(
            gateway + "/team/invitations",
            headers=admin,
            json={
                "email": staff_email,
                "hms_role": "nurse",
                "employee_id": "STAFF-JOIN",
                "department_id": department["department_id"],
            },
        ),
        201,
    )
    body = {"code": invitation["code"]}
    assert (
        client.post(
            gateway + "/auth/staff-invitations/inspect", headers=recipient, json=body
        ).status_code
        == 403
    )
    assert (
        client.post(
            gateway + "/auth/staff-invitations/accept", headers=unrelated, json=body
        ).status_code
        == 403
    )
    # The fixture verifies only its disposable account. Real users verify through email signup.
    with psycopg.connect(databases["user"]) as db:
        db.execute("UPDATE users SET email_verified=true WHERE id=%s", (staff_identity["id"],))
    preview = result(
        client.post(gateway + "/auth/staff-invitations/inspect", headers=recipient, json=body)
    )
    assert preview["hospital_id"] == hospital_id and preview["hms_role"] == "nurse"

    def join(_):
        return result(
            client.post(gateway + "/auth/staff-invitations/accept", headers=recipient, json=body)
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        joins = list(pool.map(join, range(2)))
    assert joins[0]["staff_id"] == joins[1]["staff_id"]
    assert sorted(reply["already_joined"] for reply in joins) == [False, True]
    assert result(client.get(urls["user"] + "/me", headers=recipient))["role"] == "user"
    listed = result(client.get(gateway + "/auth/workspaces", headers=recipient))
    assert any(row["hospital_id"] == hospital_id and row["hms_role"] == "nurse" for row in listed)
    token = result(
        client.post(
            gateway + "/auth/workspace-session",
            headers=recipient,
            json={"hospital_id": hospital_id},
        )
    )
    staff_auth = {"Authorization": "Bearer " + token["access_token"]}
    assert client.get(gateway + "/departments", headers=staff_auth).status_code == 200
    assert client.get(gateway + "/team/memberships", headers=staff_auth).status_code == 404
    members = result(client.get(gateway + "/team/memberships", headers=admin))["items"]
    member = next(row for row in members if row["user_id"] == staff_identity["id"])
    path = gateway + "/team/memberships/" + member["id"]

    def change(role):
        return client.patch(
            path,
            headers=admin,
            json={"version": member["version"], "hms_role": role, "is_active": True},
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        changes = list(pool.map(change, ["doctor", "nurse"]))
    assert sorted(reply.status_code for reply in changes) == [200, 409]
    updated = next(reply.json() for reply in changes if reply.status_code == 200)
    pending = result(
        client.post(
            gateway + "/team/invitations",
            headers=admin,
            json={"email": staff_email, "hms_role": "doctor"},
        ),
        201,
    )
    result(
        client.patch(
            path,
            headers=admin,
            json={
                "version": updated["version"],
                "hms_role": updated["hms_role"],
                "is_active": False,
            },
        )
    )
    assert client.get(gateway + "/departments", headers=staff_auth).status_code in {400, 403}
    assert (
        client.post(
            gateway + "/auth/staff-invitations/accept",
            headers=recipient,
            json={"code": pending["code"]},
        ).status_code
        == 409
    )
    assert (
        client.post(
            gateway + "/auth/staff-invitations/accept", headers=recipient, json=body
        ).status_code
        == 410
    )
    result(
        client.patch(
            gateway + "/staff/" + joins[0]["staff_id"],
            headers=admin,
            json={"title": "Preserved staff edit"},
        )
    )
    replacement = result(
        client.post(
            gateway + "/team/invitations",
            headers=admin,
            json={"email": staff_email, "hms_role": "pharmacist"},
        ),
        201,
    )
    result(
        client.post(
            gateway + "/auth/staff-invitations/accept",
            headers=recipient,
            json={"code": replacement["code"]},
        )
    )
    detail = result(client.get(gateway + "/staff/" + joins[0]["staff_id"], headers=admin))
    assert detail["title"] == "Preserved staff edit" and detail["employee_id"] == "STAFF-JOIN"
    assert (
        len(
            result(
                client.get(
                    gateway + "/staff", headers=admin, params={"search": "STAFF-JOIN", "limit": 1}
                )
            )["items"]
        )
        == 1
    )
    with psycopg.connect(databases["hms"]) as db:
        assert db.execute(
            "SELECT count(*) FROM hms_staff_roles WHERE tenant_id=%s AND user_id=%s",
            (hospital_id, staff_identity["id"]),
        ).fetchone() == (1,)
        assert db.execute(
            "SELECT count(*) FROM staff_invitations WHERE tenant_id=%s AND accepted_by=%s",
            (hospital_id, staff_identity["id"]),
        ).fetchone() == (2,)
        assert (
            db.execute(
                "SELECT count(*) FROM staff_access_events WHERE tenant_id=%s", (hospital_id,)
            ).fetchone()[0]
            >= 7
        )
        target = db.execute(
            "SELECT database_url FROM tenant_registry WHERE id=%s", (hospital_id,)
        ).fetchone()[0]
    with psycopg.connect(
        make_url(target).set(drivername="postgresql").render_as_string(hide_password=False)
    ) as db:
        assert db.execute(
            "SELECT count(*) FROM staff_members WHERE user_id=%s", (staff_identity["id"],)
        ).fetchone() == (1,)
        assert db.execute(
            "SELECT count(*) FROM department_memberships WHERE staff_id=%s", (joins[0]["staff_id"],)
        ).fetchone() == (1,)


def test_staff_migration_refuses_to_discard_invitation_and_access_history(services):
    _, _, databases, _, env = services
    with psycopg.connect(databases["hms"]) as db:
        tenant = uuid4()
        db.execute(
            "INSERT INTO tenant_registry (id, hospital_name, slug, database_url, config_json) VALUES (%s, 'History fixture', %s, 'postgresql://unused/unused', '{}')",
            (tenant, "history-" + tenant.hex),
        )
        db.execute(
            "INSERT INTO staff_access_events (id, tenant_id, actor_id, action, details) VALUES (%s, %s, %s, 'migration.fixture', '{}')",
            (uuid4(), tenant, uuid4()),
        )
    downgrade = migrate("hms", env, "downgrade", "20260914_0002")
    assert (
        downgrade.returncode != 0
        and "cannot discard staff invitation/access history" in downgrade.stderr
    )
    with psycopg.connect(databases["hms"]) as db:
        assert db.execute("SELECT version_num FROM alembic_version").fetchone() == (
            "20260915_0003",
        )
