from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.patient import Patient, Visit
from ..schemas.patient import PatientCreate, PatientUpdate, VisitCreate, VisitUpdate


async def _generate_mrn(db: AsyncSession, prefix: str = "MRN") -> str:
    result = await db.execute(select(func.count(Patient.id)))
    count = result.scalar_one() + 1
    return f"{prefix}-{count:06d}"


async def create_patient(body: PatientCreate, db: AsyncSession, mrn_prefix: str = "MRN") -> Patient:
    mrn = await _generate_mrn(db, mrn_prefix)
    patient = Patient(
        medapp_user_id=body.medapp_user_id,
        mrn=mrn,
        first_name=body.first_name,
        last_name=body.last_name,
        other_names=body.other_names,
        date_of_birth=body.date_of_birth,
        gender=body.gender,
        blood_group=body.blood_group,
        phone_primary=body.phone_primary,
        phone_secondary=body.phone_secondary,
        email=body.email,
        address=body.address,
        city=body.city,
        region=body.region,
        national_id=body.national_id,
        insurance_provider=body.insurance_provider,
        insurance_policy_number=body.insurance_policy_number,
        emergency_contact_name=body.emergency_contact_name,
        emergency_contact_phone=body.emergency_contact_phone,
        emergency_contact_relationship=body.emergency_contact_relationship,
        allergies_json=body.allergies,
        chronic_conditions_json=body.chronic_conditions,
        notes=body.notes,
    )
    db.add(patient)
    await db.flush()
    return patient


async def list_patients(
    db: AsyncSession,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Patient], int]:
    query = select(Patient).where(Patient.is_active.is_(True))
    count_query = select(func.count(Patient.id)).where(Patient.is_active.is_(True))

    if search:
        like = f"%{search}%"
        search_filter = (
            Patient.first_name.ilike(like)
            | Patient.last_name.ilike(like)
            | Patient.mrn.ilike(like)
            | Patient.phone_primary.ilike(like)
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    result = await db.execute(
        query.order_by(Patient.created_at.desc()).limit(limit).offset(offset)
    )
    return list(result.scalars().all()), total


async def get_patient(patient_id: UUID, db: AsyncSession) -> Patient | None:
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    return result.scalar_one_or_none()


async def update_patient(patient_id: UUID, body: PatientUpdate, db: AsyncSession) -> Patient | None:
    patient = await get_patient(patient_id, db)
    if patient is None:
        return None
    update_data = body.model_dump(exclude_unset=True)
    if "allergies" in update_data:
        update_data["allergies_json"] = update_data.pop("allergies")
    if "chronic_conditions" in update_data:
        update_data["chronic_conditions_json"] = update_data.pop("chronic_conditions")
    for key, value in update_data.items():
        setattr(patient, key, value)
    await db.flush()
    return patient


async def create_visit(patient_id: UUID, body: VisitCreate, db: AsyncSession) -> Visit:
    visit = Visit(
        patient_id=patient_id,
        visit_type=body.visit_type,
        department_id=body.department_id,
        assigned_doctor_id=body.assigned_doctor_id,
        chief_complaint=body.chief_complaint,
        vitals_json=body.vitals,
        checked_in_at=datetime.now(tz=timezone.utc),
    )
    db.add(visit)
    await db.flush()
    return visit


async def list_visits(patient_id: UUID, db: AsyncSession) -> list[Visit]:
    result = await db.execute(
        select(Visit)
        .where(Visit.patient_id == patient_id)
        .order_by(Visit.created_at.desc())
    )
    return list(result.scalars().all())


async def get_visit(visit_id: UUID, db: AsyncSession) -> Visit | None:
    result = await db.execute(select(Visit).where(Visit.id == visit_id))
    return result.scalar_one_or_none()


async def update_visit(visit_id: UUID, body: VisitUpdate, db: AsyncSession) -> Visit | None:
    visit = await get_visit(visit_id, db)
    if visit is None:
        return None
    update_data = body.model_dump(exclude_unset=True)
    if "vitals" in update_data:
        update_data["vitals_json"] = update_data.pop("vitals")
    if update_data.get("status") == "discharged" and visit.checked_out_at is None:
        update_data["checked_out_at"] = datetime.now(tz=timezone.utc)
    for key, value in update_data.items():
        setattr(visit, key, value)
    await db.flush()
    return visit
