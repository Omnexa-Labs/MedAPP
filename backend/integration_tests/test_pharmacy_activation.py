"""Disposable PostgreSQL/HTTP approval, PMS bootstrap, identity and stock journey."""

import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import httpx
import psycopg
import pytest
from PIL import Image
from pharmacy_inventory_journey import inventory_journey
from pharmacy_purchasing_journey import purchasing_journey
from pharmacy_transactions_journey import transactions_journey
from pharmacy_corrections_journey import corrections_journey
from psycopg import sql
from sqlalchemy.engine import make_url
from test_hospital_activation import (  # noqa: F401
    BACKEND,
    JWT_SECRET,
    account,
    free_port,
    migrate,
    result,
)
from test_hospital_activation import (
    postgres as hospital_postgres,
)

PMS_SECRET = "pharmacy-qa-workspace-signing-secret-2026"
PMS_ACTIVATION = "pharmacy-qa-pms-activation-secret-2026"
STOCK_SECRET = "pharmacy-qa-stock-signature-secret-2026"
HANDOFF_SECRET = "pharmacy-qa-handoff-credential-only-2026"
postgres = hospital_postgres


@pytest.fixture(scope="module")
def services(postgres, tmp_path_factory):
    directory = tmp_path_factory.mktemp("pharmacy-http-postgres")
    names = ("user", "pharmacy", "pms", "onboarding", "api_gateway")
    ports = {name: free_port() for name in names}
    urls = {name: f"http://127.0.0.1:{ports[name]}" for name in names}
    parsed = make_url(postgres)
    env = {
        **os.environ,
        "PYTHONUTF8": "1",
        "MEDAPP_TEST_MIGRATED": "1",
        "USER_PUBLISH_EVENTS": "false",
        "USER_JWT_ISSUER": "medapp",
        "ONBOARDING_ACTIVATION_ENABLED": "true",
        "ONBOARDING_ACTIVATION_POLL_SECONDS": "1",
        "ONBOARDING_JWT_ISSUER": "medapp",
        "PMS_DEV_MODE": "false",
        "PMS_JWT_SECRET": PMS_SECRET,
        "PMS_MEDAPP_JWT_SECRET": JWT_SECRET,
        "PMS_USER_SERVICE_URL": urls["user"],
        "PMS_MEDAPP_DEPLOYMENT_KEY": "accra",
        "PMS_ONBOARDING_ACTIVATION_SECRET": PMS_ACTIVATION,
        "PMS_MEDAPP_WEBHOOK_SECRET": STOCK_SECRET,
        "USER_PHARMACY_SERVICE_URL": urls["pharmacy"],
        "USER_PMS_HANDOFF_DEPLOYMENTS": json.dumps(
            {
                "accra": {
                    "web_origin": "https://pharmacy.example",
                    "handoff_secret": HANDOFF_SECRET,
                }
            }
        ),
        "PHARMACY_PMS_DEPLOYMENTS": json.dumps(
            {
                "accra": {
                    "label": "QA Accra",
                    "api_url": urls["pms"],
                    "web_origin": "https://pharmacy.example",
                    "activation_secret": PMS_ACTIVATION,
                    "stock_secret": STOCK_SECRET,
                }
            }
        ),
        "PHARMACY_PUBLIC_API_ORIGIN": urls["api_gateway"],
        "GW_JWT_SECRET": JWT_SECRET,
        "GW_USER_SERVICE_URL": urls["user"],
        "GW_PHARMACY_SERVICE_URL": urls["pharmacy"],
        "GW_ONBOARDING_SERVICE_URL": urls["onboarding"],
        "MEDAPP_DEFAULT_JWT_SECRET": JWT_SECRET,
        "MEDAPP_DEFAULT_JWT_ISSUER": "medapp",
        "MEDAPP_DEFAULT_JWT_AUDIENCE": "medapp.platform",
    }
    databases = {}
    for name in names[:-1]:
        database = "qa_" + name + "_" + uuid4().hex
        with psycopg.connect(postgres, autocommit=True) as db:
            db.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database)))
        databases[name] = parsed.set(database=database).render_as_string(hide_password=False)
        env[name.upper() + "_DATABASE_URL"] = parsed.set(
            drivername="postgresql+asyncpg", database=database
        ).render_as_string(hide_password=False)
        if name != "pms":
            env[name.upper() + "_JWT_SECRET"] = JWT_SECRET
        else:
            env["PMS_DATABASE_URL_SYNC"] = parsed.set(
                drivername="postgresql+psycopg", database=database
            ).render_as_string(hide_password=False)
        env[name.upper() + "_LOG_LEVEL"] = "WARNING"
        if name in {"user", "pharmacy"}:
            secret = f"pharmacy-qa-{name}-approval-secret-2026"
            env[name.upper() + "_ONBOARDING_ACTIVATION_SECRET"] = secret
            env["ONBOARDING_ACTIVATION_" + name.upper() + "_SECRET"] = secret
            env["ONBOARDING_ACTIVATION_" + name.upper() + "_URL"] = urls[name]
        migration = migrate(name, env, "upgrade", "head")
        assert migration.returncode == 0, migration.stderr
    children, logs = [], []
    try:
        with httpx.Client(timeout=30, trust_env=False) as client:
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
                deadline = time.monotonic() + 45
                while time.monotonic() < deadline:
                    assert child.poll() is None, f"{name} exited; inspect {directory}"
                    try:
                        if client.get(urls[name] + "/healthz", timeout=2).status_code == 200:
                            break
                    except httpx.RequestError:
                        pass
                    time.sleep(0.2)
                else:
                    raise AssertionError(f"{name} did not start; inspect {directory}")
            yield client, urls, databases, env
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


def wait_activation(client, url, headers, expected):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        activation = result(client.get(url + "/activation", headers=headers))
        if activation["state"] == expected:
            return activation
        assert activation["state"] in {"pending", "retry"}, activation
        time.sleep(0.2)
    raise AssertionError(activation)


def test_approved_pharmacy_uses_assigned_deployment_and_real_medapp_identity(services):
    client, urls, databases, env = services
    email, owner, identity = account(client, urls, databases)
    _, reviewer, _ = account(client, urls, databases, admin=True)
    root = urls["onboarding"] + "/v1/onboarding/applications"
    application = result(
        client.post(
            root,
            headers=owner,
            json={
                "partner_type": "pharmacy",
                "legal_name": "QA Care Pharmacy Ltd",
                "display_name": "QA Care Pharmacy",
                "license_number": "L" * 240,
                "registration_number": "QA-REG-2026",
                "address_line1": "1 Pharmacy Road",
                "country": "Ghana",
                "city": "Accra",
                "email": email,
                "phone": "+233200000000",
            },
        ),
        201,
    )
    application_url = root + "/" + application["application_id"]
    for kind in ("pharmacy_license", "registration_certificate"):
        application = result(
            client.post(
                application_url + "/documents/upload",
                params={"kind": kind},
                headers={
                    **owner,
                    "If-Match": str(application["version"]),
                    "Content-Type": "application/pdf",
                },
                content=b"%PDF-1.7\nSynthetic pharmacy QA credential\n%%EOF",
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
    delayed = wait_activation(client, application_url, owner, "attention_required")
    assert delayed["reason"] == "workspace_setup_required"
    pharmacy_id = delayed["profile_id"]
    assert pharmacy_id
    public = urls["api_gateway"] + "/v1/pharmacies"
    assert client.get(public + "/" + pharmacy_id, headers=owner).status_code == 404
    assert result(client.get(public + "?only_listable=false", headers=owner))["total"] == 0
    deploy = urls["api_gateway"] + "/v1/pharmacy-workspaces/" + pharmacy_id + "/deployment"
    assert client.get(deploy, headers=owner).status_code == 403

    def assign(_):
        return client.put(
            deploy, headers={**reviewer, "If-Match": "0"}, json={"deployment_key": "accra"}
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(response.status_code for response in pool.map(assign, range(2))) == [200, 412]
    with psycopg.connect(databases["onboarding"]) as db:
        snapshot = db.execute(
            "SELECT command_json FROM application_activations WHERE application_id=%s",
            (application["application_id"],),
        ).fetchone()[0]
    command = {**snapshot, "pharmacy_id": pharmacy_id, "deployment_key": "accra"}

    # Concurrent first delivery must create one workspace and one reserved owner.
    def bootstrap(_):
        return client.post(
            urls["pms"] + "/internal/pharmacy-activations",
            json=command,
            headers={"X-Activation-Secret": PMS_ACTIVATION},
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        for response in pool.map(bootstrap, range(2)):
            assert response.status_code == 200, response.text
    result(
        client.post(
            application_url + "/activation/retry",
            headers={**reviewer, "If-Match": str(application["version"])},
        )
    )
    active = wait_activation(client, application_url, owner, "active")
    assert active["profile_id"] == pharmacy_id
    assert (
        result(client.get(urls["user"] + "/me", headers=owner))["role"]
        == identity["role"]
        == "user"
    )
    assert result(client.get(deploy, headers=reviewer))["activated_at"]
    with psycopg.connect(databases["pms"]) as db:
        assert db.execute("SELECT count(*) FROM medapp_workspace").fetchone() == (1,)
        assert db.execute(
            "SELECT count(*) FROM medapp_memberships WHERE staff_id IS NULL"
        ).fetchone() == (1,)
        assert db.execute("SELECT count(*) FROM staff").fetchone() == (0,)
        assert db.execute("SELECT country, license_no FROM pharmacy_profile").fetchone() == (
            "Ghana",
            "L" * 240,
        )
    # QA verifies only the newly created disposable account. Production uses OTP.
    assert client.post(urls["pms"] + "/v1/auth/medapp-session", headers=owner).status_code == 401
    with psycopg.connect(databases["user"]) as db:
        db.execute("UPDATE users SET email_verified=true WHERE id=%s", (identity["id"],))
    session = result(client.post(urls["pms"] + "/v1/auth/medapp-session", headers=owner))
    staff_headers = {"Authorization": "Bearer " + session["access_token"]}
    assert (
        result(client.get(urls["pms"] + "/v1/auth/me", headers=staff_headers))["full_name"]
        == "QA Owner"
    )
    assert client.get(urls["pms"] + "/v1/auth/me", headers=owner).status_code == 401
    context_response = client.get(urls["pms"] + "/v1/auth/context", headers=staff_headers)
    context = result(context_response)
    assert context_response.headers["Cache-Control"] == "private, no-store"
    assert context["user"] == session["user"]
    assert context["pharmacy"]["id"] == pharmacy_id
    assert context["pharmacy"]["deployment_key"] == "accra"
    assert set(context) == {"user", "pharmacy", "expires_at"}
    # The mobile handoff targets the approved pharmacy, keeping all bearer tokens
    # off the browser URL and preserving the mobile account's independent session.
    workspaces = result(client.get(urls["api_gateway"] + "/v1/pharmacy-workspaces", headers=owner))
    assert len(workspaces) == 1 and workspaces[0]["pharmacy_id"] == pharmacy_id
    assert (
        result(client.get(urls["api_gateway"] + "/v1/pharmacy-workspaces", headers=reviewer)) == []
    )
    handoff_headers = {**owner, "X-Device-Id": "qa-mobile"}
    # Use the actual source session device from the disposable account helper.
    with psycopg.connect(databases["user"]) as db:
        source_device = db.execute(
            "SELECT device_id FROM refresh_tokens WHERE user_id=%s AND revoked_at IS NULL LIMIT 1",
            (identity["id"],),
        ).fetchone()[0]
    handoff_headers["X-Device-Id"] = source_device
    handoff = result(
        client.post(
            urls["api_gateway"] + "/v1/auth/pharmacy-handoffs",
            headers=handoff_headers,
            json={
                "pharmacy_id": pharmacy_id,
                "return_uri": "medapp://pharmacy-workspaces",
                "return_state": "s" * 32,
            },
        )
    )
    proof = {"code": parse_qs(urlsplit(handoff["url"]).fragment)["code"][0]}
    browser_headers = {
        "X-Pms-Deployment-Key": "accra",
        "X-Pms-Handoff-Secret": HANDOFF_SECRET,
        "X-Device-Id": "d" * 64,
    }
    browser = result(
        client.post(
            urls["api_gateway"] + "/v1/auth/pharmacy-handoffs/redeem",
            headers=browser_headers,
            json=proof,
        )
    )
    assert browser["pharmacy_id"] == pharmacy_id and browser["deployment_key"] == "accra"
    assert browser["destination"] == "/dashboard"
    browser_access = {"Authorization": "Bearer " + browser["tokens"]["access_token"]}
    browser_pms = result(
        client.post(urls["pms"] + "/v1/auth/medapp-session", headers=browser_access)
    )
    assert browser_pms["user"] == session["user"]
    assert (
        client.post(
            urls["api_gateway"] + "/v1/auth/pharmacy-handoffs/redeem",
            headers=browser_headers,
            json=proof,
        ).status_code
        == 410
    )
    assert (
        client.post(
            urls["user"] + "/auth/logout",
            json={"refresh_token": browser["tokens"]["refresh_token"]},
            headers={"X-Device-Id": "d" * 64},
        ).status_code
        == 204
    )
    assert client.get(urls["api_gateway"] + "/v1/me", headers=owner).status_code == 200
    assert client.post(urls["pms"] + "/v1/auth/medapp-session", headers=reviewer).status_code in {
        401,
        404,
    }
    with psycopg.connect(databases["pms"]) as db:
        assert db.execute("SELECT count(*) FROM staff WHERE password_hash IS NULL").fetchone() == (
            1,
        )
    profile_url = urls["api_gateway"] + "/v1/pharmacy-workspaces/" + pharmacy_id + "/profile"
    draft = result(client.get(profile_url, headers=owner))
    assert draft["version"] == 1 and not draft["is_listed"]
    assert client.get(profile_url, headers=reviewer).status_code == 404
    hours = {day: "closed" for day in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")}
    changes = {"name": "Published Care Pharmacy", "operating_hours": hours, "services_offered": ["Vaccinations"], "head_pharmacist_name": "QA Pharmacist"}
    saved = result(client.patch(profile_url, headers=owner, json={"version": 1, "changes": changes}))
    assert saved["version"] == 2 and saved["published"] is None
    assert client.get(public + "/" + pharmacy_id, headers=owner).status_code == 404
    published = result(client.post(profile_url + "/publish", headers=owner, json={"version": 2}))
    assert published["is_listed"] and published["version"] == 3
    def edit_profile(name):
        return client.patch(profile_url, headers=owner, json={"version": 3, "changes": {"name": name}})
    with ThreadPoolExecutor(max_workers=2) as pool:
        concurrent = list(pool.map(edit_profile, ["Draft A", "Draft B"]))
    assert sorted(response.status_code for response in concurrent) == [200, 409]
    assert result(client.get(public + "/" + pharmacy_id, headers=owner))["name"] == "Published Care Pharmacy"
    result(client.post(profile_url + "/withdraw", headers=owner, json={"version": 4}))
    assert client.get(public + "/" + pharmacy_id, headers=owner).status_code == 404
    result(client.post(profile_url + "/publish", headers=owner, json={"version": 5}))
    history = result(client.get(profile_url + "/history", headers=owner))
    assert [event["version"] for event in history["items"]] == [6, 5, 4, 3, 2]
    badge = result(
        client.get(public + "/" + pharmacy_id + "/stock?drug_name=Paracetamol", headers=owner)
    )
    assert badge["source"] == "pms" and badge["quantity"] == 0
    details = result(client.get(public + "/" + pharmacy_id, headers=owner))
    assert details["services_offered"] == ["Vaccinations"] and details["head_pharmacist_name"] == "QA Pharmacist"
    assert not {"directory_draft", "directory_version"} & details.keys()
    assert not {"user_id", "pms_base_url", "pms_partner_secret_id"} & details.keys()
    image = BytesIO()
    Image.new("RGB", (40, 30), "teal").save(image, format="PNG")
    def upload_photo(_):
        return client.post(profile_url + "/photo", content=image.getvalue(),
            headers={**owner, "Content-Type": "image/png", "If-Match": "6"})
    with ThreadPoolExecutor(max_workers=2) as pool:
        uploads = list(pool.map(upload_photo, range(2)))
    assert sorted(response.status_code for response in uploads) == [200, 409]
    uploaded = result(next(response for response in uploads if response.status_code == 200))
    photo_path = uploaded["draft"]["photo_url"]
    photo_url = urls["api_gateway"] + photo_path
    preview_url = profile_url + "/photos/" + photo_path.rsplit("/", 1)[-1]
    assert client.get(photo_url).status_code == 404
    private_photo = client.get(preview_url, headers=owner)
    assert private_photo.status_code == 200
    assert client.get(preview_url, headers=reviewer).status_code == 404
    with psycopg.connect(databases["pharmacy"]) as db:
        assert db.execute("SELECT count(*) FROM pharmacy_photos").fetchone() == (1,)
    result(client.post(profile_url + "/publish", headers=owner, json={"version": 7}))
    photo = client.get(photo_url)
    assert photo.status_code == 200 and photo.content == private_photo.content
    assert photo.headers["cache-control"] == "private, no-store"
    assert result(client.get(public + "/" + pharmacy_id, headers=owner))["photo_url"] == photo_url
    result(client.post(profile_url + "/withdraw", headers=owner, json={"version": 8}))
    assert client.get(photo_url).status_code == 404
    result(client.post(profile_url + "/publish", headers=owner, json={"version": 9}))
    inventory_journey(client, urls, databases, staff_headers, owner, public + "/" + pharmacy_id)
    purchasing_journey(client, urls, databases, staff_headers)
    transactions_journey(client, urls, databases, staff_headers)
    corrections_journey(client, urls, databases, staff_headers)
    with psycopg.connect(databases["pms"]) as db:
        db.execute("UPDATE medapp_memberships SET is_active=false")
    assert client.get(urls["pms"] + "/v1/auth/me", headers=staff_headers).status_code == 401
    assert client.get(urls["pms"] + "/v1/auth/context", headers=staff_headers).status_code == 401
    assert client.post(urls["pms"] + "/v1/auth/medapp-session", headers=owner).status_code == 404
    assert client.get(profile_url, headers=owner).status_code == 403
    assert client.get(preview_url, headers=owner).status_code == 403
    assert client.post(profile_url + "/photo", content=image.getvalue(),
        headers={**owner, "Content-Type": "image/png", "If-Match": "10"}).status_code == 403
    assert client.post(profile_url + "/publish", headers=owner, json={"version": 6}).status_code == 403
    assert bootstrap(0).status_code == 409
    # Downgrades must refuse to erase receipted ownership or assignments.
    for name in ("pharmacy", "pms"):
        assert migrate(name, env, "downgrade", "-1").returncode != 0


@pytest.mark.parametrize("name,base", [("pharmacy", "20260527_0001"), ("pms", "0001_initial")])
def test_empty_migration_roundtrip_preserves_legacy_rows(postgres, name, base):
    parsed = make_url(postgres)
    database = "qa_pharmacy_migration_" + uuid4().hex
    with psycopg.connect(postgres, autocommit=True) as db:
        db.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database)))
    url = parsed.set(database=database).render_as_string(hide_password=False)
    env = {
        **os.environ,
        name.upper() + "_DATABASE_URL": parsed.set(
            drivername="postgresql+asyncpg", database=database
        ).render_as_string(hide_password=False),
        name.upper() + "_DATABASE_URL_SYNC": parsed.set(
            drivername="postgresql+psycopg", database=database
        ).render_as_string(hide_password=False),
    }
    assert migrate(name, env, "upgrade", base).returncode == 0
    legacy_id = uuid4()
    legacy_drug_id, legacy_batch_id = uuid4(), uuid4()
    legacy_supplier_id, legacy_order_id, legacy_item_id = uuid4(), uuid4(), uuid4()
    legacy_rx_id, legacy_sale_id = uuid4(), uuid4()
    legacy_rx_line_id, legacy_sale_line_id = uuid4(), uuid4()
    with psycopg.connect(url) as db:
        if name == "pharmacy":
            db.execute(
                "INSERT INTO pharmacy_profiles(id,user_id,name,slug) VALUES(%s,%s,'Legacy','legacy')",
                (legacy_id, uuid4()),
            )
        else:
            db.execute(
                "INSERT INTO pharmacy_profile(id,name,slug) VALUES(%s,'Legacy','legacy')",
                (legacy_id,),
            )
            db.execute(
                "INSERT INTO drugs(id,name,category,form,strength,unit) "
                "VALUES(%s,'Legacy drug','analgesic','tablet','500 mg','tablet')",
                (legacy_drug_id,),
            )
            db.execute("INSERT INTO suppliers(id,name) VALUES(%s,'Legacy supplier')", (legacy_supplier_id,))
            db.execute("INSERT INTO purchase_orders(id,po_number,supplier_id,status,total_cents) VALUES(%s,'LEGACY-PO',%s,'received',2000)", (legacy_order_id, legacy_supplier_id))
            db.execute("INSERT INTO purchase_order_items(id,purchase_order_id,drug_id,quantity,unit_cost_cents) VALUES(%s,%s,%s,20,100)", (legacy_item_id, legacy_order_id, legacy_drug_id))
            db.execute(
                "INSERT INTO drug_batches(id,drug_id,batch_number,quantity_received,quantity_on_hand,received_at,expiry_date) "
                "VALUES(%s,%s,'LEGACY',17,12,'2026-01-01','2027-01-01')",
                (legacy_batch_id, legacy_drug_id),
            )
            db.execute("UPDATE drug_batches SET purchase_order_id=%s WHERE id=%s", (legacy_order_id, legacy_batch_id))
            db.execute("INSERT INTO prescriptions(id,rx_number,status,notes) VALUES(%s,'LEGACY-RX','partially_dispensed','Original instructions')", (legacy_rx_id,))
            db.execute("INSERT INTO sales(id,sale_number,prescription_id,total_cents,status) VALUES(%s,'LEGACY-SALE',%s,1250,'completed')", (legacy_sale_id, legacy_rx_id))
            db.execute("INSERT INTO prescription_items(id,prescription_id,drug_id,drug_name_snapshot,quantity_prescribed,quantity_dispensed) VALUES(%s,%s,%s,'Legacy drug',10,5)", (legacy_rx_line_id, legacy_rx_id, legacy_drug_id))
            db.execute("INSERT INTO sale_items(id,sale_id,drug_id,drug_batch_id,drug_name_snapshot,quantity,unit_price_cents,line_total_cents) VALUES(%s,%s,%s,%s,'Legacy drug',5,250,1250)", (legacy_sale_line_id, legacy_sale_id, legacy_drug_id, legacy_batch_id))
    for direction, target in [("upgrade", "head"), ("downgrade", base), ("upgrade", "head")]:
        completed = migrate(name, env, direction, target)
        assert completed.returncode == 0, completed.stderr
    with psycopg.connect(url) as db:
        table = "pharmacy_profiles" if name == "pharmacy" else "pharmacy_profile"
        assert db.execute(
            sql.SQL("SELECT name FROM {} WHERE id=%s").format(sql.Identifier(table)), (legacy_id,)
        ).fetchone() == ("Legacy",)
        assert db.execute("SELECT count(*) FROM professional_activation_receipts").fetchone() == (
            0,
        )
        if name == "pms":
            assert db.execute("SELECT prescription_item_id,quantity,line_total_cents FROM sale_items WHERE id=%s", (legacy_sale_line_id,)).fetchone() == (None, 5, 1250)
            assert db.execute("SELECT quantity_prescribed,quantity_dispensed FROM prescription_items WHERE id=%s", (legacy_rx_line_id,)).fetchone() == (10, 5)
            assert db.execute("SELECT version,status,notes,cancellation_reason FROM prescriptions WHERE id=%s", (legacy_rx_id,)).fetchone() == (1, "partially_dispensed", "Original instructions", None)
            assert db.execute("SELECT version,total_cents,status,notes,void_reason FROM sales WHERE id=%s", (legacy_sale_id,)).fetchone() == (1, 1250, "completed", None, None)
            assert db.execute("SELECT receiving_reconciled,version,status FROM purchase_orders WHERE id=%s", (legacy_order_id,)).fetchone() == (False, 1, "received")
            assert db.execute("SELECT quantity,quantity_received FROM purchase_order_items WHERE id=%s", (legacy_item_id,)).fetchone() == (20, 0)
            assert db.execute("SELECT version FROM drugs WHERE id=%s", (legacy_drug_id,)).fetchone() == (1,)
            assert db.execute("SELECT version,quantity_received,quantity_on_hand FROM drug_batches WHERE id=%s",
                (legacy_batch_id,)).fetchone() == (1, 17, 12)
