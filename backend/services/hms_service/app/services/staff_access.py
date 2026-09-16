"""Explicit hospital invitations; management authorization commits after the staff profile."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import HTTPException
from shared.auth import Principal
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from ..models.department import Department, DepartmentMembership
from ..models.mgmt import HmsStaffRole, TenantRegistry
from ..models.staff import StaffMember
from ..models.staff_invitation import StaffAccessEvent, StaffInvitation
from ..schemas.tenant import HmsStaffRoleAssign
from ..tenant import tenant_db_manager
from .tenant_access import preserve_administrator, require_tenant_admin
from .tenant_service import assign_hms_role


def now():
    return datetime.now(UTC)


def utc(value):
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def audit(db, tenant_id, actor_id, action, **details):
    db.add(
        StaffAccessEvent(
            tenant_id=tenant_id, actor_id=UUID(str(actor_id)), action=action, details=details
        )
    )


async def administrator(db, principal, writing=False):
    # A platform admin has no implicit clinical staff-management rights here.
    return await require_tenant_admin(
        db,
        Principal(subject=principal.subject, role="hms_staff"),
        UUID(principal.hospital_id),
        writing=writing,
    )


async def department(db, department_id):
    if department_id:
        row = await db.get(Department, UUID(str(department_id)))
        if row is None or not row.is_active:
            raise HTTPException(409, "Choose an active department in this hospital.")


def invitation_out(row):
    status = (
        "accepted"
        if row.accepted_at
        else "cancelled"
        if row.cancelled_at
        else "expired"
        if utc(row.expires_at) <= now()
        else "pending"
    )
    return {
        "id": row.id,
        "email": row.email,
        "hms_role": row.hms_role,
        "status": status,
        "created_at": row.created_at,
        "expires_at": row.expires_at,
        "accepted_at": row.accepted_at,
        "cancelled_at": row.cancelled_at,
    }


async def create_invitation(db, tenant_db, principal, payload):
    tenant = await administrator(db, principal, writing=True)
    await department(tenant_db, payload.department_id)
    count = await db.scalar(
        select(func.count())
        .select_from(StaffInvitation)
        .where(
            StaffInvitation.tenant_id == tenant.id,
            StaffInvitation.created_at > now() - timedelta(hours=1),
        )
    )
    if count >= 100:
        raise HTTPException(429, "Too many invitations. Try again later.")
    if payload.employee_id and await tenant_db.scalar(
        select(StaffMember.id).where(StaffMember.employee_id == payload.employee_id)
    ):
        raise HTTPException(409, "This employee ID already belongs to a staff record.")
    pending = (
        await db.scalars(
            select(StaffInvitation).where(
                StaffInvitation.tenant_id == tenant.id,
                StaffInvitation.email == payload.email,
                StaffInvitation.accepted_at.is_(None),
                StaffInvitation.cancelled_at.is_(None),
            )
        )
    ).all()
    for row in pending:
        row.cancelled_at = now()
        audit(db, tenant.id, principal.subject, "invitation.superseded", invitation_id=str(row.id))
    code = secrets.token_urlsafe(32)
    creator_version = await db.scalar(
        select(HmsStaffRole.version).where(
            HmsStaffRole.tenant_id == tenant.id, HmsStaffRole.user_id == UUID(principal.subject)
        )
    )
    row = StaffInvitation(
        tenant_id=tenant.id,
        email=payload.email,
        token_hash=hashlib.sha256(code.encode()).hexdigest(),
        hms_role=payload.hms_role.value,
        staff_data=payload.model_dump(mode="json", exclude={"email", "hms_role"}),
        created_by=UUID(principal.subject),
        creator_version=creator_version,
        expires_at=now() + timedelta(days=7),
    )
    db.add(row)
    await db.flush()
    audit(
        db,
        tenant.id,
        principal.subject,
        "invitation.created",
        invitation_id=str(row.id),
        hms_role=row.hms_role,
    )
    return {**invitation_out(row), "code": code}


async def list_invitations(db, principal, offset=0):
    tenant = await administrator(db, principal)
    rows = (
        await db.scalars(
            select(StaffInvitation)
            .where(StaffInvitation.tenant_id == tenant.id)
            .order_by(StaffInvitation.created_at.desc(), StaffInvitation.id)
            .offset(offset)
            .limit(51)
        )
    ).all()
    creators = {
        role.user_id: role.version
        for role in (
            await db.scalars(
                select(HmsStaffRole).where(
                    HmsStaffRole.tenant_id == tenant.id,
                    HmsStaffRole.is_active.is_(True),
                    HmsStaffRole.hms_role == "hospital_admin",
                    HmsStaffRole.user_id.in_([row.created_by for row in rows[:50]]),
                )
            )
        ).all()
    }
    items = []
    for row in rows[:50]:
        item = invitation_out(row)
        if item["status"] == "pending" and creators.get(row.created_by) != row.creator_version:
            item["status"] = "unavailable"
        items.append(item)
    return {"items": items, "has_more": len(rows) > 50}


async def cancel_invitation(db, principal, invitation_id):
    tenant = await administrator(db, principal, writing=True)
    row = await db.scalar(
        select(StaffInvitation).where(
            StaffInvitation.id == invitation_id, StaffInvitation.tenant_id == tenant.id
        )
    )
    if row is None:
        raise HTTPException(404, "Invitation not found.")
    if row.accepted_at:
        raise HTTPException(
            409, "This invitation was accepted. Revoke the staff membership instead."
        )
    if not row.cancelled_at:
        row.cancelled_at = now()
        audit(db, tenant.id, principal.subject, "invitation.cancelled", invitation_id=str(row.id))


async def inspect_invitation(db, code, account, *, writing=False):
    row = await db.scalar(
        select(StaffInvitation).where(
            StaffInvitation.token_hash == hashlib.sha256(code.encode()).hexdigest()
        )
    )
    if row is None:
        raise HTTPException(
            410, "This invitation is unavailable. Ask your hospital administrator for a new code."
        )
    # Same lock order as management changes, approval activation and cancellation.
    query = select(TenantRegistry).where(TenantRegistry.id == row.tenant_id)
    if writing:
        query = query.with_for_update()
    tenant = await db.scalar(query.execution_options(populate_existing=True))
    await db.refresh(row)
    if (
        not tenant
        or not tenant.is_active
        or not tenant.provisioned_at
        or row.cancelled_at
        or utc(row.expires_at) <= now()
    ):
        raise HTTPException(
            410, "This invitation is unavailable. Ask your hospital administrator for a new code."
        )
    if (
        account.get("email_verified") is not True
        or str(account.get("email", "")).strip().lower() != row.email
    ):
        raise HTTPException(
            403, "Sign in with the verified email address this invitation was sent to."
        )
    user_id = UUID(account["id"])
    if row.accepted_at:
        membership = await db.get(HmsStaffRole, row.membership_id)
        if row.accepted_by != user_id or not membership or not membership.is_active:
            raise HTTPException(
                410, "This invitation has already been used. Contact your hospital administrator."
            )
    else:
        creator = await db.scalar(
            select(HmsStaffRole.id).where(
                HmsStaffRole.tenant_id == tenant.id,
                HmsStaffRole.user_id == row.created_by,
                HmsStaffRole.hms_role == "hospital_admin",
                HmsStaffRole.is_active.is_(True),
                HmsStaffRole.version == row.creator_version,
            )
        )
        if creator is None:
            raise HTTPException(
                410,
                "The inviter's access changed. Ask a current administrator for a new code.",
            )
    return row, tenant


async def accept_invitation(db, code, account):
    row, tenant = await inspect_invitation(db, code, account, writing=True)
    if row.accepted_at:
        return {"hospital_id": tenant.id, "staff_id": row.staff_id, "already_joined": True}
    user_id = UUID(account["id"])
    existing = await db.scalar(
        select(HmsStaffRole).where(
            HmsStaffRole.tenant_id == tenant.id, HmsStaffRole.user_id == user_id
        )
    )
    if existing and (existing.is_active or utc(existing.updated_at) >= utc(row.created_at)):
        raise HTTPException(
            409,
            "Hospital access changed after this invitation. Ask your administrator to review your membership.",
        )
    first, last = account.get("first_name"), account.get("last_name")
    if (
        not isinstance(first, str)
        or not first.strip()
        or not isinstance(last, str)
        or not last.strip()
        or len(first) > 128
        or len(last) > 128
    ):
        raise HTTPException(409, "Complete your MedApp account name before joining.")
    # A retry after a management commit failure reuses the existing profile. It
    # never rewrites later edits or re-enables an inactive employment record.
    try:
        async with (
            await tenant_db_manager.get_session(str(tenant.id)) as staff_db,
            staff_db.begin(),
        ):
            await department(staff_db, row.staff_data.get("department_id"))
            staff = await staff_db.scalar(select(StaffMember).where(StaffMember.user_id == user_id))
            if staff and not staff.is_active:
                raise HTTPException(
                    409, "This staff record is inactive. Contact your hospital administrator."
                )
            if staff is None:
                fields = {k: v for k, v in row.staff_data.items() if k != "department_id"}
                staff = StaffMember(
                    id=uuid5(NAMESPACE_URL, f"medapp-hms-staff:{tenant.id}:{user_id}"),
                    user_id=user_id,
                    first_name=first.strip(),
                    last_name=last.strip(),
                    email=row.email,
                    **fields,
                )
                staff_db.add(staff)
                await staff_db.flush()
                if row.staff_data.get("department_id"):
                    staff_db.add(
                        DepartmentMembership(
                            staff_id=staff.id,
                            department_id=UUID(row.staff_data["department_id"]),
                            role_in_department="member",
                            is_primary=True,
                        )
                    )
            staff_id = staff.id
    except IntegrityError:
        raise HTTPException(
            409,
            "A staff record or employee ID conflicts with this invitation. Contact your administrator.",
        ) from None
    membership = await assign_hms_role(
        tenant.id,
        HmsStaffRoleAssign(
            user_id=user_id,
            hms_role=row.hms_role,
            department_id=row.staff_data.get("department_id"),
        ),
        db,
    )
    row.accepted_at, row.accepted_by, row.membership_id, row.staff_id = (
        now(),
        user_id,
        membership.id,
        staff_id,
    )
    audit(
        db,
        tenant.id,
        user_id,
        "invitation.accepted",
        invitation_id=str(row.id),
        membership_id=str(membership.id),
        hms_role=row.hms_role,
    )
    await db.flush()
    return {"hospital_id": tenant.id, "staff_id": staff_id, "already_joined": False}


async def list_memberships(db, staff_db, principal, offset=0):
    tenant = await administrator(db, principal)
    rows = (
        await db.scalars(
            select(HmsStaffRole)
            .where(HmsStaffRole.tenant_id == tenant.id)
            .order_by(HmsStaffRole.is_active.desc(), HmsStaffRole.created_at, HmsStaffRole.id)
            .offset(offset)
            .limit(51)
        )
    ).all()
    profiles = {
        p.user_id: p
        for p in (
            await staff_db.scalars(
                select(StaffMember).where(StaffMember.user_id.in_([r.user_id for r in rows[:50]]))
            )
        ).all()
    }
    items = []
    for row in rows[:50]:
        profile = profiles.get(row.user_id)
        items.append(
            {
                "id": row.id,
                "user_id": row.user_id,
                "hms_role": row.hms_role,
                "is_active": row.is_active,
                "version": row.version,
                "staff_id": profile.id if profile else None,
                "name": f"{profile.first_name} {profile.last_name}" if profile else None,
                "email": profile.email if profile else None,
            }
        )
    return {"items": items, "has_more": len(rows) > 50}


async def change_membership(db, principal, membership_id, payload):
    tenant = await administrator(db, principal, writing=True)
    row = await db.scalar(
        select(HmsStaffRole).where(
            HmsStaffRole.id == membership_id, HmsStaffRole.tenant_id == tenant.id
        )
    )
    if row is None:
        raise HTTPException(404, "Staff membership not found.")
    if row.version != payload.version:
        raise HTTPException(409, "This membership changed. Refresh the team before trying again.")
    # Rejoining requires a new email-bound invitation; toggling a stale record
    # must not restore a former employee's access.
    if not row.is_active and payload.is_active:
        raise HTTPException(409, "Send a new invitation to restore access.")
    await preserve_administrator(
        db, tenant.id, row, payload.hms_role.value if payload.is_active else None
    )
    before = {"hms_role": row.hms_role, "is_active": row.is_active}
    row.hms_role, row.is_active = payload.hms_role.value, payload.is_active
    row.version += 1
    audit(
        db,
        tenant.id,
        principal.subject,
        "membership.changed",
        membership_id=str(row.id),
        user_id=str(row.user_id),
        before=before,
        after={"hms_role": row.hms_role, "is_active": row.is_active},
    )
    await db.flush()
    return {
        "id": row.id,
        "hms_role": row.hms_role,
        "is_active": row.is_active,
        "version": row.version,
    }


async def access_history(db, staff_db, principal, offset=0):
    tenant = await administrator(db, principal)
    rows = (
        await db.scalars(
            select(StaffAccessEvent)
            .where(StaffAccessEvent.tenant_id == tenant.id)
            .order_by(StaffAccessEvent.created_at.desc(), StaffAccessEvent.id)
            .offset(offset)
            .limit(51)
        )
    ).all()
    actors = {
        p.user_id: f"{p.first_name} {p.last_name}"
        for p in (
            await staff_db.scalars(
                select(StaffMember).where(StaffMember.user_id.in_([r.actor_id for r in rows[:50]]))
            )
        ).all()
    }
    invite_ids = [
        UUID(r.details["invitation_id"]) for r in rows[:50] if r.details.get("invitation_id")
    ]
    invitations = {
        str(r.id): r.email
        for r in (
            await db.scalars(
                select(StaffInvitation).where(
                    StaffInvitation.tenant_id == tenant.id, StaffInvitation.id.in_(invite_ids)
                )
            )
        ).all()
    }
    return {
        "items": [
            {
                "id": r.id,
                "created_at": r.created_at,
                "actor_id": r.actor_id,
                "actor_name": actors.get(r.actor_id),
                "action": r.action,
                "details": r.details,
                "recipient_email": invitations.get(r.details.get("invitation_id")),
            }
            for r in rows[:50]
        ],
        "has_more": len(rows) > 50,
    }
