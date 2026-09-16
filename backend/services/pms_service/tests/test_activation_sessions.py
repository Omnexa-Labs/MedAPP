from datetime import datetime
from uuid import uuid4

import httpx
import jwt
import pytest
from app.config import settings
from app.deps import get_db
from app.main import app
from app.models import ActivationReceipt
from app.models.core import PharmacyProfile, Staff
from app.models.workspace import MedAppMembership, MedAppWorkspace
from app.routers import medapp_sessions
from app.services.auth_service import hash_password, issue_token
from pydantic import SecretStr
from shared.auth.jwt import issue_access_token
from shared.db import Base
from shared.onboarding.pharmacies import PharmacyWorkspaceActivation, pharmacy_resource_id
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

ACTIVATION = "pms-activation-only-secret-2026-test"
PMS_SECRET = "pms-session-only-secret-2026-test-123"
PLATFORM_SECRET = "medapp-platform-only-secret-2026-test"
HEADERS = {"X-Activation-Secret": ACTIVATION}


@pytest.fixture
def command(monkeypatch):
    monkeypatch.setattr(settings, "onboarding_activation_secret", SecretStr(ACTIVATION))
    monkeypatch.setattr(settings, "jwt_secret", PMS_SECRET)
    monkeypatch.setattr(settings, "medapp_jwt_secret", SecretStr(PLATFORM_SECRET))
    monkeypatch.setattr(settings, "medapp_deployment_key", "accra")
    application = uuid4()
    return PharmacyWorkspaceActivation(
        application_id=application,
        pharmacy_id=pharmacy_resource_id(application),
        deployment_key="accra",
        applicant_id=uuid4(),
        reviewer_id=uuid4(),
        approval_version=7,
        name="Care Pharmacy",
        license_number="L" * 240,
        address_line1="12 High Street",
        city="Accra",
        country="Ghana",
        contact_email="office@pharmacy.example",
        contact_phone="+233200000000",
    )


@pytest.fixture
async def sessions():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as db:
        await db.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture
async def client(sessions):
    async def database():
        async with sessions() as db, db.begin():
            yield db

    app.dependency_overrides[get_db] = database
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
    app.dependency_overrides.clear()


async def activate(client, command):
    return await client.post(
        "/internal/pharmacy-activations", json=command.model_dump(mode="json"), headers=HEADERS
    )


def parent(command, subject=None, ttl=15):
    return issue_access_token(
        subject=str(subject or command.applicant_id),
        role="user",
        secret=PLATFORM_SECRET,
        ttl_minutes=ttl,
    )


def account(command):
    return medapp_sessions.VerifiedAccount(
        id=command.applicant_id,
        email="ama@example.com",
        first_name="Ama",
        last_name="Mensah",
        email_verified=True,
        is_active=True,
    )


def identity(monkeypatch, command):
    async def verify(authorization, subject):
        assert subject == str(command.applicant_id)
        return account(command)

    monkeypatch.setattr(medapp_sessions, "verify_account", verify)


async def test_bootstrap_preserves_business_data_and_reserves_passwordless_owner(
    client, command, sessions
):
    for _ in range(2):
        response = await activate(client, command)
        assert response.status_code == 200, response.text
        assert response.json()["resource_id"] == str(command.pharmacy_id)
    async with sessions() as db:
        assert await db.scalar(select(func.count()).select_from(Staff)) == 0
        assert await db.scalar(select(func.count()).select_from(ActivationReceipt)) == 1
        profile = await db.get(PharmacyProfile, command.pharmacy_id)
        assert profile.country == "Ghana" and profile.license_no == command.license_number
        member = await db.scalar(select(MedAppMembership))
        assert member.user_id == command.applicant_id and member.staff_id is None
        profile.name = "Owner's later edit"
        await db.commit()
    assert (await activate(client, command)).status_code == 200
    async with sessions() as db:
        assert (await db.get(PharmacyProfile, command.pharmacy_id)).name == "Owner's later edit"


@pytest.mark.parametrize("change", ["body", "deployment", "owner", "membership", "workspace"])
async def test_conflicting_or_revoked_activation_is_not_repaired_implicitly(
    client, command, sessions, change
):
    assert (await activate(client, command)).status_code == 200
    if change == "body":
        command = command.model_copy(update={"name": "Changed approval"})
    elif change == "deployment":
        command = command.model_copy(update={"deployment_key": "elsewhere"})
    else:
        async with sessions() as db:
            if change == "membership":
                (await db.scalar(select(MedAppMembership))).is_active = False
            else:
                workspace = await db.scalar(select(MedAppWorkspace))
                if change == "owner":
                    workspace.owner_id = uuid4()
                else:
                    workspace.is_active = False
            await db.commit()
    assert (await activate(client, command)).status_code == 409


@pytest.mark.parametrize("kind", ["profile", "staff"])
async def test_legacy_pms_data_is_not_adopted(client, command, sessions, kind):
    async with sessions() as db:
        db.add(
            PharmacyProfile(name="Legacy", slug="legacy")
            if kind == "profile"
            else Staff(
                full_name="Existing",
                email="ama@example.com",
                role="pharmacy_admin",
                password_hash="existing",
            )
        )
        await db.commit()
    assert (await activate(client, command)).status_code == 409
    async with sessions() as db:
        assert await db.scalar(select(func.count()).select_from(MedAppWorkspace)) == 0


@pytest.mark.parametrize("secret,status", [("wrong", 401), ("", 401)])
async def test_bootstrap_rejects_wrong_credential(client, command, secret, status):
    assert (
        await client.post(
            "/internal/pharmacy-activations",
            json=command.model_dump(mode="json"),
            headers={"X-Activation-Secret": secret},
        )
    ).status_code == status


async def test_medapp_exchange_links_actual_identity_and_bounds_session(
    client, command, sessions, monkeypatch
):
    assert (await activate(client, command)).status_code == 200
    identity(monkeypatch, command)
    token = parent(command, ttl=2)
    headers = {"Authorization": "Bearer " + token}
    first = await client.post("/v1/auth/medapp-session", headers=headers)
    assert first.status_code == 200, first.text
    second = await client.post("/v1/auth/medapp-session", headers=headers)
    assert second.json()["user"] == first.json()["user"]
    assert first.headers["Cache-Control"] == "no-store"
    assert first.json()["user"]["full_name"] == "Ama Mensah"
    child = jwt.decode(
        first.json()["access_token"],
        PMS_SECRET,
        algorithms=["HS256"],
        audience="medapp.pms",
        issuer="medapp.pms",
    )
    source = jwt.decode(
        token, PLATFORM_SECRET, algorithms=["HS256"], audience="medapp.platform", issuer="medapp"
    )
    assert child["exp"] <= source["exp"] and child["exp"] - child["iat"] <= 300
    assert child["pharmacy_id"] == str(command.pharmacy_id) and child["deployment_key"] == "accra"
    me = await client.get(
        "/v1/auth/me", headers={"Authorization": "Bearer " + first.json()["access_token"]}
    )
    assert me.status_code == 200 and me.json()["full_name"] == "Ama Mensah"
    context = await client.get(
        "/v1/auth/context", headers={"Authorization": "Bearer " + first.json()["access_token"]}
    )
    assert context.status_code == 200
    assert context.headers["Cache-Control"] == "private, no-store"
    assert context.json()["user"] == me.json()
    assert context.json()["pharmacy"] == {
        "id": str(command.pharmacy_id),
        "name": command.name,
        "deployment_key": "accra",
    }
    assert datetime.fromisoformat(context.json()["expires_at"]).timestamp() == child["exp"]
    assert set(context.json()) == {"user", "pharmacy", "expires_at"}
    async with sessions() as db:
        staff = await db.scalar(select(Staff))
        assert staff.password_hash is None and staff.email == "ama@example.com"
        staff.password_hash = hash_password("A-new-local-password!")
        await db.commit()
    assert (
        await client.post(
            "/v1/auth/login", json={"email": "ama@example.com", "password": "A-new-local-password!"}
        )
    ).status_code == 401


@pytest.mark.parametrize("change", ["staff", "member", "workspace", "deployment", "role", "owner"])
async def test_existing_session_rechecks_live_access(
    client, command, sessions, monkeypatch, change
):
    assert (await activate(client, command)).status_code == 200
    identity(monkeypatch, command)
    response = await client.post(
        "/v1/auth/medapp-session", headers={"Authorization": "Bearer " + parent(command)}
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    async with sessions() as db:
        if change in {"staff", "role"}:
            staff = await db.scalar(select(Staff))
            if change == "staff":
                staff.is_active = False
            else:
                staff.role = "cashier"
        elif change == "member":
            (await db.scalar(select(MedAppMembership))).is_active = False
        elif change == "workspace":
            (await db.scalar(select(MedAppWorkspace))).is_active = False
        elif change == "owner":
            (await db.scalar(select(MedAppWorkspace))).owner_id = uuid4()
        else:
            monkeypatch.setattr(settings, "medapp_deployment_key", "different")
        await db.commit()
    assert (
        await client.get("/v1/auth/me", headers={"Authorization": "Bearer " + token})
    ).status_code == 401
    assert (await activate(client, command)).status_code == 409
    assert (
        await client.get("/v1/auth/context", headers={"Authorization": "Bearer " + token})
    ).status_code == 401


async def test_platform_token_cannot_directly_access_pms_and_unknown_owner_cannot_exchange(
    client, command, monkeypatch
):
    assert (await activate(client, command)).status_code == 200
    assert (
        await client.get("/v1/auth/me", headers={"Authorization": "Bearer " + parent(command)})
    ).status_code == 401
    unknown = command.model_copy(update={"applicant_id": uuid4()})
    identity(monkeypatch, unknown)
    assert (
        await client.post(
            "/v1/auth/medapp-session", headers={"Authorization": "Bearer " + parent(unknown)}
        )
    ).status_code == 404


async def test_verified_email_does_not_adopt_existing_local_staff(
    client, command, sessions, monkeypatch
):
    assert (await activate(client, command)).status_code == 200
    identity(monkeypatch, command)
    async with sessions() as db:
        db.add(
            Staff(
                full_name="Other person",
                email="AMA@example.com",
                role="cashier",
                password_hash="existing",
            )
        )
        await db.commit()
    assert (
        await client.post(
            "/v1/auth/medapp-session", headers={"Authorization": "Bearer " + parent(command)}
        )
    ).status_code == 409


@pytest.mark.parametrize(
    "variant,status",
    [
        ("valid", 200),
        ("inactive", 401),
        ("unverified", 401),
        ("wrong_id", 401),
        ("unavailable", 503),
    ],
)
async def test_exchange_checks_real_identity_service_contract(
    client, command, monkeypatch, variant, status
):
    assert (await activate(client, command)).status_code == 200
    original = httpx.AsyncClient

    def remote(request):
        assert request.url.path == "/me" and request.headers["Authorization"].startswith("Bearer ")
        if variant == "unavailable":
            return httpx.Response(503)
        data = account(command).model_dump(mode="json")
        if variant == "inactive":
            data["is_active"] = False
        if variant == "unverified":
            data["email_verified"] = False
        if variant == "wrong_id":
            data["id"] = str(uuid4())
        return httpx.Response(200, json=data)

    monkeypatch.setattr(
        medapp_sessions.httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(remote), **kwargs),
    )
    assert (
        await client.post(
            "/v1/auth/medapp-session", headers={"Authorization": "Bearer " + parent(command)}
        )
    ).status_code == status


async def test_local_login_has_pms_namespace_and_uses_current_staff_role(client, command, sessions):
    async with sessions() as db:
        staff = Staff(
            full_name="Local Pharmacist",
            email="local@example.com",
            role="pharmacy_admin",
            password_hash=hash_password("Local-password-2026!"),
        )
        db.add(staff)
        await db.commit()
        token = issue_token(staff)
        staff.role = "cashier"
        await db.commit()
    response = await client.get("/v1/auth/me", headers={"Authorization": "Bearer " + token})
    assert response.status_code == 200 and response.json()["role"] == "cashier"
    local = await client.post(
        "/v1/auth/login", json={"email": "local@example.com", "password": "Local-password-2026!"}
    )
    assert local.status_code == 200
    context = await client.get("/v1/auth/context", headers={"Authorization": "Bearer " + token})
    assert context.status_code == 200
    assert context.json()["user"]["role"] == "cashier"
    assert context.json()["pharmacy"] == {
        "id": None,
        "name": settings.pharmacy_name,
        "deployment_key": None,
    }
