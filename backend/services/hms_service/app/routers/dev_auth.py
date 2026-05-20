from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import UUID, uuid4

import jwt as pyjwt
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..deps import get_tenant_db

router = APIRouter(prefix="/v1", tags=["dev"])

DEV_HOSPITAL_ID = "00000000-0000-4000-a000-000000000001"
DEV_USER_ID = "00000000-0000-4000-a000-000000000002"


class DevLoginRequest(BaseModel):
    email: str = "admin@hospital.dev"
    password: str = ""


class DevLoginResponse(BaseModel):
    access_token: str
    user: dict


@router.post("/auth/login", response_model=DevLoginResponse)
async def dev_login(body: DevLoginRequest):
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": DEV_USER_ID,
        "role": "admin",
        "hospital_id": DEV_HOSPITAL_ID,
        "hms_role": "hospital_admin",
        "email": body.email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=24)).timestamp()),
    }
    token = pyjwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return DevLoginResponse(
        access_token=token,
        user={
            "id": DEV_USER_ID,
            "email": body.email,
            "full_name": "Dev Admin",
            "role": "admin",
            "hospital_id": DEV_HOSPITAL_ID,
            "hms_role": "hospital_admin",
        },
    )


@router.post("/dev/seed", status_code=status.HTTP_201_CREATED)
async def seed_dev_data(db: AsyncSession = Depends(get_tenant_db)):
    from ..models.patient import Patient, Visit
    from ..models.staff import StaffMember
    from ..models.department import Department, DepartmentMembership
    from ..models.appointment import Appointment, QueueEntry
    from ..models.pharmacy import Drug, DrugBatch
    from ..models.billing import Invoice, InvoiceLineItem

    dept_gen = Department(name="General Medicine", slug="general-medicine", description="General medical care")
    dept_ped = Department(name="Pediatrics", slug="pediatrics", description="Children's health")
    dept_emr = Department(name="Emergency", slug="emergency", description="Emergency department")
    dept_phm = Department(name="Pharmacy", slug="pharmacy-dept", description="Hospital pharmacy")
    db.add_all([dept_gen, dept_ped, dept_emr, dept_phm])
    await db.flush()

    staff_data = [
        ("Dr. Kwame", "Asante", "Dr.", "Internal Medicine", "MB ChB, FWACP", dept_gen.id),
        ("Dr. Ama", "Mensah", "Dr.", "Pediatrics", "MB ChB, DCH", dept_ped.id),
        ("Dr. Yaw", "Boateng", "Dr.", "Emergency Medicine", "MB ChB, MCEM", dept_emr.id),
        ("Nurse Akua", "Owusu", "Nurse", "General Nursing", "RGN, BSc Nursing", dept_gen.id),
        ("Nurse Kofi", "Adjei", "Nurse", "Pediatric Nursing", "RGN", dept_ped.id),
        ("Mr. Emmanuel", "Tetteh", "Pharm.", "Clinical Pharmacy", "BPharm, PharmD", dept_phm.id),
    ]
    staff_members = []
    for i, (first, last, title, specialty, qual, dept_id) in enumerate(staff_data):
        s = StaffMember(
            user_id=uuid4(),
            employee_id=f"EMP-{i+1:03d}",
            first_name=first,
            last_name=last,
            title=title,
            specialty=specialty,
            qualification=qual,
            phone=f"+23324{i}000000",
            email=f"{first.split()[-1].lower()}.{last.lower()}@hospital.dev",
        )
        db.add(s)
        staff_members.append(s)
    await db.flush()

    for s, (_, _, _, _, _, dept_id) in zip(staff_members, staff_data):
        db.add(DepartmentMembership(staff_id=s.id, department_id=dept_id, role_in_department="member", is_primary=True))

    patients_data = [
        ("Kwesi", "Appiah", "1985-03-12", "male", "O+", "+233241000001"),
        ("Ama", "Darko", "1992-07-25", "female", "A+", "+233241000002"),
        ("Kofi", "Mensah", "1978-11-03", "male", "B+", "+233241000003"),
        ("Akosua", "Boateng", "2001-01-15", "female", "AB-", "+233241000004"),
        ("Yaw", "Asante", "1965-09-30", "male", "O-", "+233241000005"),
        ("Efua", "Osei", "2015-04-08", "female", "A-", "+233241000006"),
        ("Kwabena", "Adjei", "1990-12-20", "male", "B-", "+233241000007"),
        ("Adwoa", "Tetteh", "1998-06-14", "female", "O+", "+233241000008"),
    ]
    patients = []
    for i, (first, last, dob, gender, blood, phone) in enumerate(patients_data):
        p = Patient(
            mrn=f"MRN-{i+1:06d}",
            first_name=first,
            last_name=last,
            date_of_birth=dob,
            gender=gender,
            blood_group=blood,
            phone_primary=phone,
            email=f"{first.lower()}.{last.lower()}@email.com",
            address=f"{i+10} Accra Road",
            city="Accra",
            region="Greater Accra",
            allergies_json=["penicillin"] if i % 3 == 0 else [],
            chronic_conditions_json=["hypertension"] if i % 4 == 0 else [],
        )
        db.add(p)
        patients.append(p)
    await db.flush()

    for i, p in enumerate(patients[:4]):
        v = Visit(
            patient_id=p.id,
            visit_type="outpatient" if i % 2 == 0 else "emergency",
            status="registered",
            department_id=dept_gen.id if i % 2 == 0 else dept_emr.id,
            assigned_doctor_id=staff_members[0].id if i % 2 == 0 else staff_members[2].id,
            chief_complaint=["Headache and fever", "Chest pain", "Routine checkup", "Abdominal pain"][i],
            checked_in_at=datetime.now(tz=timezone.utc),
        )
        db.add(v)

    now = datetime.now(tz=timezone.utc)
    for i in range(3):
        a = Appointment(
            patient_id=patients[i].id,
            doctor_staff_id=staff_members[i % 3].id,
            department_id=[dept_gen.id, dept_ped.id, dept_emr.id][i],
            appointment_type="scheduled",
            status="scheduled",
            scheduled_date=now.date(),
            scheduled_start=f"{9+i}:00",
            scheduled_end=f"{9+i}:30",
            reason=["Follow-up visit", "Child vaccination", "Blood pressure check"][i],
        )
        db.add(a)

    for i, p in enumerate(patients[:3]):
        q = QueueEntry(
            patient_id=p.id,
            department_id=dept_gen.id,
            queue_type="walk_in",
            priority=3 if i < 2 else 1,
            status="waiting",
            ticket_number=f"Q-{i+1:03d}",
            joined_at=now - timedelta(minutes=30 - i * 10),
        )
        db.add(q)

    drugs_data = [
        ("Amoxicillin", "Amoxil", "antibiotic", "capsule", "500mg", "capsule", 100),
        ("Paracetamol", "Tylenol", "analgesic", "tablet", "500mg", "tablet", 200),
        ("Metformin", "Glucophage", "antidiabetic", "tablet", "850mg", "tablet", 150),
        ("Amlodipine", "Norvasc", "antihypertensive", "tablet", "5mg", "tablet", 120),
        ("Ibuprofen", "Brufen", "analgesic", "tablet", "400mg", "tablet", 180),
        ("Omeprazole", "Losec", "antacid", "capsule", "20mg", "capsule", 80),
        ("Ciprofloxacin", "Cipro", "antibiotic", "tablet", "500mg", "tablet", 60),
        ("Artemether/Lumefantrine", "Coartem", "antimalarial", "tablet", "20/120mg", "tablet", 250),
    ]
    drugs = []
    for name, brand, cat, form, strength, unit, reorder in drugs_data:
        d = Drug(
            name=name, brand_name=brand, category=cat, form=form,
            strength=strength, unit=unit, reorder_level=reorder,
        )
        db.add(d)
        drugs.append(d)
    await db.flush()

    for i, d in enumerate(drugs):
        remaining = d.reorder_level + 50 if i % 3 != 0 else d.reorder_level - 20
        b = DrugBatch(
            drug_id=d.id,
            batch_number=f"BATCH-2026-{i+1:03d}",
            quantity_received=500,
            quantity_remaining=max(remaining, 0),
            unit_cost_cents=100 + i * 50,
            selling_price_cents=200 + i * 80,
            currency="GHS",
            supplier=["PharmaCo Ghana", "MediSupply", "HealthDist"][i % 3],
            expiry_date="2027-12-31",
        )
        db.add(b)

    inv = Invoice(
        patient_id=patients[0].id,
        invoice_number="INV-000001",
        status="pending",
        total_amount_cents=15000,
        paid_amount_cents=0,
        currency="GHS",
        issued_at=now,
        created_by_staff_id=staff_members[0].id,
    )
    db.add(inv)
    await db.flush()

    db.add(InvoiceLineItem(
        invoice_id=inv.id, description="Consultation Fee",
        category="consultation", quantity=1, unit_price_cents=10000, total_cents=10000,
    ))
    db.add(InvoiceLineItem(
        invoice_id=inv.id, description="Blood Test",
        category="lab_test", quantity=1, unit_price_cents=5000, total_cents=5000,
    ))

    await db.flush()

    return {
        "seeded": {
            "departments": 4,
            "staff": len(staff_members),
            "patients": len(patients),
            "visits": 4,
            "appointments": 3,
            "queue_entries": 3,
            "drugs": len(drugs),
            "drug_batches": len(drugs),
            "invoices": 1,
        }
    }
