from uuid import UUID, uuid4

import pytest
from app.config import settings
from app.models import PartnerApplication
from sqlalchemy.orm.exc import StaleDataError

BASE = "/v1/onboarding/applications"
PDF = b"%PDF-1.7\nTest credential bytes\n%%EOF"


def match(application):
    return {"If-Match": f'"{application["version"]}"'}


async def create(client, payload):
    response = await client.post(BASE, json=payload)
    assert response.status_code == 201, response.text
    application = response.json()
    assert response.headers["etag"] == '"1"'
    assert response.headers["cache-control"] == "private, no-store"
    return application


async def upload(client, application, kind, content=PDF, content_type="application/pdf"):
    return await client.post(
        f"{BASE}/{application['application_id']}/documents/upload",
        params={"kind": kind, "label": " Credential "},
        content=content,
        headers={**match(application), "Content-Type": content_type},
    )


async def credentials(client, application):
    kinds = {
        "practitioner": [
            "nursing_license" if application["practitioner_role"] == "nurse" else "medical_license",
            "government_id",
        ],
        "hospital": ["hospital_license", "registration_certificate"],
        "pharmacy": ["pharmacy_license", "registration_certificate"],
    }[application["partner_type"]]
    for kind in kinds:
        response = await upload(client, application, kind)
        assert response.status_code == 200, response.text
        application = response.json()
    return application


async def submit(client, application, attestation=True):
    return await client.post(
        f"{BASE}/{application['application_id']}/submit",
        json={
            "attestation_accepted": attestation,
            "attestation_version": "professional-application-v1",
        },
        headers=match(application),
    )


async def review(client, application, action, **extra):
    return await client.post(
        f"{BASE}/{application['application_id']}/review",
        json={"action": action, **extra},
        headers=match(application),
    )


async def ready(client, payload):
    application = await credentials(client, await create(client, payload))
    response = await submit(client, application)
    assert response.status_code == 200, response.text
    assert response.json()["attested_at"]
    return response.json()


async def test_hospital_team_application_can_submit_and_be_reviewed(
    hospital_client, admin_client, hospital_team_payload
):
    application = await ready(hospital_client, hospital_team_payload)
    response = await review(admin_client, application, "under_review")
    assert response.status_code == 200, response.text
    application = response.json()
    assert application["status"] == "under_review"
    response = await review(
        admin_client,
        application,
        "approve",
        verified_document_ids=[d["document_id"] for d in application["documents"]],
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "approved"
    assert len(response.json()["team_members"]) == 1
    assert all(
        d["verified"] and d["verified_by_user_id"] and d["verified_at"]
        for d in response.json()["documents"]
    )


async def test_practitioner_submission_requires_documents(doctor_client, practitioner_payload):
    application = await create(doctor_client, practitioner_payload)
    response = await submit(doctor_client, application)
    assert response.status_code == 400
    assert "medical_license" in response.text and "government_id" in response.text
    response = await upload(doctor_client, application, "medical_license")
    assert response.status_code == 200
    application = response.json()
    assert (await submit(doctor_client, application)).status_code == 400
    response = await upload(doctor_client, application, "government_id")
    assert (await submit(doctor_client, response.json())).status_code == 200


async def test_pharmacy_application_is_owned_by_submitter(
    pharmacist_client, admin_client, pharmacy_payload
):
    application = await create(pharmacist_client, pharmacy_payload)
    response = await pharmacist_client.get(f"{BASE}/{application['application_id']}")
    assert response.status_code == 200
    assert response.json()["partner_type"] == "pharmacy"
    assert len((await admin_client.get(BASE)).json()["items"]) == 1
    summary = (await pharmacist_client.get("/v1/onboarding/summary")).json()
    assert summary["total_count"] == summary["draft_count"] == 1
    assert summary["recent_applications"][0]["partner_type"] == "pharmacy"


async def test_non_owner_cannot_read_application(
    pharmacist_client, doctor_client, pharmacy_payload
):
    application = await create(pharmacist_client, pharmacy_payload)
    assert (await doctor_client.get(f"{BASE}/{application['application_id']}")).status_code == 403
    assert (await doctor_client.get(BASE)).json() == {"items": []}
    assert (await doctor_client.get("/v1/onboarding/summary")).json()["total_count"] == 0


async def test_rejection_requires_reason(admin_client, hospital_client, hospital_team_payload):
    application = await ready(hospital_client, hospital_team_payload)
    for reason in (None, "   "):
        response = await review(admin_client, application, "reject", rejection_reason=reason)
        assert response.status_code == 400
    assert (await hospital_client.get(f"{BASE}/{application['application_id']}")).json()[
        "version"
    ] == application["version"]


@pytest.mark.parametrize("role", ["doctor", "nurse"])
async def test_patient_can_apply_without_professional_access(
    patient_client, admin_client, practitioner_payload, principal_patient, role
):
    practitioner_payload["practitioner_role"] = role
    application = await ready(patient_client, practitioner_payload)
    approved = await review(
        admin_client,
        application,
        "approve",
        verified_document_ids=[d["document_id"] for d in application["documents"]],
    )
    assert approved.status_code == 200
    assert approved.json()["practitioner_role"] == role
    assert approved.json()["submitted_by_user_id"] == principal_patient.subject
    assert "access_token" not in approved.json()
    assert principal_patient.role == "patient"
    # Application approval does not grant this applicant review permissions.
    assert (await review(patient_client, approved.json(), "under_review")).status_code == 403


async def test_draft_partial_edit_readback_and_stale_save(patient_client, practitioner_payload):
    original = await create(patient_client, practitioner_payload)
    url = f"{BASE}/{original['application_id']}"
    saved = await patient_client.patch(
        url,
        json={"city": " Accra ", "notes": "updated", "specialty": None},
        headers=match(original),
    )
    assert saved.status_code == 200, saved.text
    assert saved.headers["etag"] == '"2"'
    assert saved.json()["city"] == "Accra" and saved.json()["specialty"] is None
    assert saved.json()["legal_name"] == original["legal_name"]
    stale = await patient_client.patch(url, json={"city": "Kumasi"}, headers=match(original))
    assert stale.status_code == 412
    readback = (await patient_client.get(url)).json()
    assert readback["city"] == "Accra"
    empty = await patient_client.patch(url, json={}, headers=match(readback))
    assert empty.status_code == 200 and empty.json()["version"] == 2
    events = (await patient_client.get(url + "/history")).json()
    assert [e["action"] for e in events] == ["created", "details_updated"]


@pytest.mark.parametrize(
    "header,code",
    [
        (None, 428),
        ("*", 400),
        ('W/"1"', 400),
        ('"1", "2"', 400),
        ('"1', 400),
        ('1"', 400),
        ("0", 400),
        ("-1", 400),
        ("x", 400),
    ],
)
async def test_mutation_requires_current_version(
    patient_client, practitioner_payload, header, code
):
    application = await create(patient_client, practitioner_payload)
    response = await patient_client.patch(
        f"{BASE}/{application['application_id']}",
        json={"city": "Accra"},
        headers={} if header is None else {"If-Match": header},
    )
    assert response.status_code == code


@pytest.mark.parametrize(
    "payload",
    [
        {"status": "approved"},
        {"submitted_by_user_id": str(uuid4())},
        {"partner_type": "hospital"},
        {"documents": []},
        {"reviewed_by_user_id": str(uuid4())},
        {"version": 99},
        {"legal_name": None},
        {"display_name": "   "},
        {"city": "x" * 129},
    ],
)
async def test_edit_rejects_privileged_or_invalid_fields(
    patient_client, practitioner_payload, payload
):
    application = await create(patient_client, practitioner_payload)
    response = await patient_client.patch(
        f"{BASE}/{application['application_id']}", json=payload, headers=match(application)
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"status": "approved"},
        {"verified": True},
        {
            "documents": [
                {"kind": "medical_license", "url": "https://example.test/a.pdf", "verified": True}
            ]
        },
        {"documents": [{"kind": "medical_license", "url": "https://example.test/a.pdf"}]},
    ],
)
async def test_create_rejects_client_verification_and_external_links(
    patient_client, practitioner_payload, payload
):
    response = await patient_client.post(BASE, json={**practitioner_payload, **payload})
    assert response.status_code == 422


async def test_legacy_document_link_endpoint_is_retired(
    patient_client, practitioner_payload, document_store
):
    application = await create(patient_client, practitioner_payload)
    response = await patient_client.post(
        f"{BASE}/{application['application_id']}/documents",
        json={"kind": "government_id", "url": "http://169.254.169.254/", "verified": True},
    )
    assert response.status_code == 410
    assert not document_store.writes


@pytest.mark.parametrize(
    "mime,data",
    [
        ("application/pdf", PDF),
        ("image/png", b"\x89PNG\r\n\x1a\nimage"),
        ("image/jpeg", b"\xff\xd8\xffimage"),
    ],
)
async def test_upload_and_authenticated_download(
    patient_client, admin_client, doctor_client, practitioner_payload, document_store, mime, data
):
    application = await create(patient_client, practitioner_payload)
    uploaded = await upload(patient_client, application, "medical_license", data, mime)
    assert uploaded.status_code == 200, uploaded.text
    document = uploaded.json()["documents"][0]
    assert document["verified"] is False and document["verified_by_user_id"] is None
    assert document["label"] == "Credential" and document["size_bytes"] == len(data)
    assert "storage_key" not in document and "storage_generation" not in document
    denied = await doctor_client.get(document["url"])
    assert denied.status_code == 403 and not document_store.reads
    for client in (patient_client, admin_client):
        response = await client.get(document["url"])
        assert response.status_code == 200 and response.content == data
        assert response.headers["content-type"] == mime
        assert response.headers["content-disposition"].startswith("attachment;")
        assert response.headers["cache-control"] == "private, no-store"
        assert response.headers["x-content-type-options"] == "nosniff"


@pytest.mark.parametrize(
    "mime,data,status",
    [
        ("application/pdf", b"", 400),
        ("application/pdf", b"<html>bad</html>", 415),
        ("image/png", PDF, 415),
        ("text/html", PDF, 415),
        ("application/octet-stream", PDF, 415),
    ],
)
async def test_invalid_document_is_not_stored(
    patient_client, practitioner_payload, document_store, mime, data, status
):
    application = await create(patient_client, practitioner_payload)
    response = await upload(patient_client, application, "government_id", data, mime)
    assert response.status_code == status
    assert not document_store.writes
    assert (await patient_client.get(f"{BASE}/{application['application_id']}")).json()[
        "documents"
    ] == []


async def test_upload_size_is_bounded_for_declared_and_chunked_bodies(
    patient_client, practitioner_payload, document_store, monkeypatch
):
    monkeypatch.setattr(settings, "document_max_bytes", 10)
    application = await create(patient_client, practitioner_payload)
    assert (await upload(patient_client, application, "medical_license")).status_code == 413

    async def chunks():
        yield b"%PDF-1.7"
        yield b"more bytes"

    response = await patient_client.post(
        f"{BASE}/{application['application_id']}/documents/upload",
        params={"kind": "medical_license"},
        content=chunks(),
        headers={**match(application), "Content-Type": "application/pdf"},
    )
    assert response.status_code == 413 and not document_store.writes


async def test_document_limits_and_unknown_kind(
    patient_client, practitioner_payload, document_store, monkeypatch
):
    monkeypatch.setattr(settings, "document_limit", 1)
    application = await create(patient_client, practitioner_payload)
    assert (await upload(patient_client, application, "anything")).status_code == 422
    response = await upload(patient_client, application, "medical_license")
    assert response.status_code == 200
    assert (await upload(patient_client, response.json(), "government_id")).status_code == 409
    assert len(document_store.writes) == 1


async def test_storage_failure_rolls_back_and_retry_succeeds(
    patient_client, practitioner_payload, document_store
):
    application = await create(patient_client, practitioner_payload)
    document_store.fail_write = True
    assert (await upload(patient_client, application, "medical_license")).status_code == 503
    fresh = (await patient_client.get(f"{BASE}/{application['application_id']}")).json()
    assert fresh["version"] == application["version"] and fresh["documents"] == []
    document_store.fail_write = False
    response = await upload(patient_client, fresh, "medical_license")
    assert response.status_code == 200
    document = response.json()["documents"][0]
    document_store.fail_read = True
    assert (await patient_client.get(document["url"])).status_code == 503
    document_store.fail_read = False
    key = next(iter(document_store.objects))
    document_store.objects[key] = b"corrupt"
    assert (await patient_client.get(document["url"])).status_code == 503


async def test_other_applicant_and_admin_cannot_edit_owner_draft(
    patient_client, doctor_client, admin_client, practitioner_payload, document_store
):
    application = await create(patient_client, practitioner_payload)
    url = f"{BASE}/{application['application_id']}"
    for client in (doctor_client, admin_client):
        assert (
            await client.patch(url, json={"city": "Accra"}, headers=match(application))
        ).status_code == 403
        assert (await upload(client, application, "medical_license")).status_code == 403
        assert (await submit(client, application)).status_code == 403
        assert (await client.post(url + "/reopen", headers=match(application))).status_code == 403
    assert not document_store.writes
    assert (await doctor_client.get(url + "/history")).status_code == 403


@pytest.mark.parametrize("state", ["submitted", "under_review", "approved", "rejected"])
async def test_non_draft_mutations_are_locked(
    patient_client, admin_client, practitioner_payload, state
):
    application = await ready(patient_client, practitioner_payload)
    if state != "submitted":
        response = await review(
            admin_client,
            application,
            {"under_review": "under_review", "approved": "approve", "rejected": "reject"}[state],
            **(
                {"rejection_reason": "Replace credential"}
                if state == "rejected"
                else {"verified_document_ids": [d["document_id"] for d in application["documents"]]}
                if state == "approved"
                else {}
            ),
        )
        assert response.status_code == 200
        application = response.json()
    url = f"{BASE}/{application['application_id']}"
    assert (
        await patient_client.patch(url, json={"city": "Accra"}, headers=match(application))
    ).status_code == 409
    assert (await upload(patient_client, application, "government_id")).status_code == 409
    assert (
        await patient_client.delete(
            url + "/documents/" + application["documents"][0]["document_id"],
            headers=match(application),
        )
    ).status_code == 409
    assert (await submit(patient_client, application)).status_code == 409
    if state != "rejected":
        assert (
            await patient_client.post(url + "/reopen", headers=match(application))
        ).status_code == 409


async def test_rejected_application_can_be_corrected_with_review_evidence_preserved(
    patient_client, admin_client, practitioner_payload
):
    application = await ready(patient_client, practitioner_payload)
    url = f"{BASE}/{application['application_id']}"
    old_document = application["documents"][0]
    rejected = await review(
        admin_client, application, "reject", rejection_reason=" License scan is unreadable "
    )
    assert rejected.status_code == 200
    reopened = await patient_client.post(url + "/reopen", headers=match(rejected.json()))
    assert reopened.status_code == 200 and reopened.json()["attested_at"] is None
    removed = await patient_client.delete(
        url + "/documents/" + old_document["document_id"], headers=match(reopened.json())
    )
    assert removed.status_code == 200
    replacement = await upload(
        patient_client, removed.json(), "medical_license", PDF + b" clearer scan"
    )
    assert replacement.status_code == 200
    resubmitted = await submit(patient_client, replacement.json())
    assert resubmitted.status_code == 200
    assert resubmitted.json()["rejection_reason"] is None
    application = resubmitted.json()
    approved = await review(
        admin_client,
        application,
        "approve",
        verified_document_ids=[d["document_id"] for d in application["documents"]],
    )
    assert approved.status_code == 200
    history = (await patient_client.get(url + "/history")).json()
    assert [e["application_version"] for e in history] == list(
        range(1, approved.json()["version"] + 1)
    )
    submissions = [e["details"] for e in history if e["action"] == "submitted"]
    assert len(submissions) == 2 and all(s["attested_at"] for s in submissions)
    assert old_document["document_id"] in [d["document_id"] for d in submissions[0]["documents"]]
    assert old_document["document_id"] not in [
        d["document_id"] for d in submissions[1]["documents"]
    ]
    rejection = next(e for e in history if e["action"] == "rejected")
    assert rejection["details"]["rejection_reason"] == "License scan is unreadable"
    assert "storage_key" not in str(history) and "storage_generation" not in str(history)
    assert (await admin_client.get(old_document["url"])).content == PDF
    assert (
        await review(admin_client, approved.json(), "reject", rejection_reason="Late decision")
    ).status_code == 409


async def test_approval_requires_verified_current_required_documents(
    patient_client, admin_client, practitioner_payload
):
    application = await ready(patient_client, practitioner_payload)
    for ids in ([], [application["documents"][0]["document_id"]], [str(uuid4())]):
        response = await review(admin_client, application, "approve", verified_document_ids=ids)
        assert response.status_code == 400
    assert (
        await review(
            admin_client,
            application,
            "under_review",
            verified_document_ids=[application["documents"][0]["document_id"]],
        )
    ).status_code == 400
    assert (await review(patient_client, application, "approve")).status_code == 403


async def test_admin_cannot_self_review(admin_client, practitioner_payload):
    application = await ready(admin_client, practitioner_payload)
    assert (
        await review(
            admin_client,
            application,
            "approve",
            verified_document_ids=[d["document_id"] for d in application["documents"]],
        )
    ).status_code == 403


@pytest.mark.parametrize("attestation", [False, None, "true", 1])
async def test_submit_requires_explicit_true_attestation(
    patient_client, practitioner_payload, attestation
):
    application = await credentials(
        patient_client, await create(patient_client, practitioner_payload)
    )
    assert (await submit(patient_client, application, attestation)).status_code == 422


async def test_missing_attestation_and_required_identity(patient_client, practitioner_payload):
    practitioner_payload.pop("professional_first_name")
    application = await credentials(
        patient_client, await create(patient_client, practitioner_payload)
    )
    url = f"{BASE}/{application['application_id']}/submit"
    assert (await patient_client.post(url, json={}, headers=match(application))).status_code == 422
    response = await submit(patient_client, application)
    assert response.status_code == 400 and "professional_first_name" in response.text


async def test_team_member_add_remove_and_requirement(
    hospital_client, hospital_team_payload, patient_client, practitioner_payload
):
    hospital_team_payload["team_members"] = []
    application = await credentials(
        hospital_client, await create(hospital_client, hospital_team_payload)
    )
    assert (await submit(hospital_client, application)).status_code == 400
    url = f"{BASE}/{application['application_id']}/team-members"
    bad = await hospital_client.post(
        url, json={"full_name": "   ", "role": "nurse"}, headers=match(application)
    )
    assert bad.status_code == 422
    added = await hospital_client.post(
        url, json={"full_name": " Jane ", "role": "nurse"}, headers=match(application)
    )
    assert added.status_code == 200, added.text
    application = added.json()
    member = application["team_members"][0]
    assert member["full_name"] == "Jane"
    removed = await hospital_client.delete(
        url + "/" + member["member_id"], headers=match(application)
    )
    assert removed.status_code == 200 and removed.json()["team_members"] == []
    assert (
        await hospital_client.delete(url + "/" + member["member_id"], headers=match(removed.json()))
    ).status_code == 404
    practitioner = await create(patient_client, practitioner_payload)
    assert (
        await patient_client.post(
            f"{BASE}/{practitioner['application_id']}/team-members",
            json={"full_name": "Jane", "role": "nurse"},
            headers=match(practitioner),
        )
    ).status_code == 400


async def test_legacy_documents_are_unverified_and_cannot_satisfy_submission(
    patient_client, practitioner_payload, sessionmaker
):
    application = await create(patient_client, practitioner_payload)
    async with sessionmaker() as db:
        record = await db.get(PartnerApplication, UUID(application["application_id"]))
        record.documents_json = [
            {
                "document_id": str(uuid4()),
                "kind": kind,
                "url": "https://files.example.test/a.pdf",
                "verified": True,
                "uploaded_by_user_id": application["submitted_by_user_id"],
                "uploaded_at": application["created_at"],
            }
            for kind in ("medical_license", "government_id")
        ]
        await db.commit()
    application = (await patient_client.get(f"{BASE}/{application['application_id']}")).json()
    assert all(not d["verified"] for d in application["documents"])
    assert (await submit(patient_client, application)).status_code == 400


async def test_sqlalchemy_version_guard_rejects_a_stale_writer(
    patient_client, practitioner_payload, sessionmaker
):
    application = await create(patient_client, practitioner_payload)
    async with sessionmaker() as first, sessionmaker() as second:
        first_copy = await first.get(PartnerApplication, UUID(application["application_id"]))
        second_copy = await second.get(PartnerApplication, UUID(application["application_id"]))
        first_copy.city = "Accra"
        await first.commit()
        second_copy.city = "Kumasi"
        with pytest.raises(StaleDataError):
            await second.flush()
        await second.rollback()
    readback = (await patient_client.get(f"{BASE}/{application['application_id']}")).json()
    assert readback["city"] == "Accra" and readback["version"] == 2


async def test_requirements_are_scoped_and_attestation_version_must_match(
    patient_client, doctor_client, practitioner_payload
):
    application = await credentials(
        patient_client, await create(patient_client, practitioner_payload)
    )
    url = f"{BASE}/{application['application_id']}"
    response = await patient_client.get(url + "/requirements")
    assert response.status_code == 200
    requirements = response.json()
    assert set(requirements["required_document_kinds"]) == {"medical_license", "government_id"}
    assert "professional_first_name" in requirements["required_fields"]
    assert (
        requirements["attestation_text"]
        and requirements["attestation_version"] == "professional-application-v1"
    )
    assert (await doctor_client.get(url + "/requirements")).status_code == 403
    for version in ("old-terms", None):
        response = await patient_client.post(
            url + "/submit",
            headers=match(application),
            json={"attestation_accepted": True, "attestation_version": version},
        )
        assert response.status_code == 422
    assert (await submit(patient_client, application)).status_code == 200
