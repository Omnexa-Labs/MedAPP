from __future__ import annotations

from uuid import UUID

import pytest

from app.models.social import SocialPost, SocialQuestion


@pytest.mark.asyncio
async def test_doctor_can_create_blog_and_patient_can_engage(doctor_client, patient_client, blog_payload):
    post_resp = await doctor_client.post("/v1/social/posts", json=blog_payload)
    assert post_resp.status_code == 201, post_resp.text
    post_id = post_resp.json()["post_id"]

    comment_resp = await patient_client.post(f"/v1/social/posts/{post_id}/comments", json={"body": "Very helpful."})
    assert comment_resp.status_code == 201, comment_resp.text

    reaction_resp = await patient_client.post(f"/v1/social/posts/{post_id}/react", json={"reaction_type": "support"})
    assert reaction_resp.status_code == 201, reaction_resp.text


@pytest.mark.asyncio
async def test_feed_returns_only_approved_posts(doctor_client, patient_client, sessionmaker, blog_payload):
    first_resp = await doctor_client.post("/v1/social/posts", json=blog_payload)
    first_id = first_resp.json()["post_id"]

    async with sessionmaker() as session:
        post = await session.get(SocialPost, UUID(first_id))
        post.moderation_status = "approved"
        await session.commit()

    feed_resp = await patient_client.get("/v1/social/feed")
    assert feed_resp.status_code == 200, feed_resp.text
    assert len(feed_resp.json()["items"]) == 1
    assert feed_resp.json()["items"][0]["post_id"] == first_id


@pytest.mark.asyncio
async def test_patient_can_ask_and_doctor_can_answer(patient_client, doctor_client, qa_payload):
    ask_resp = await patient_client.post("/v1/social/qa", json=qa_payload)
    assert ask_resp.status_code == 201, ask_resp.text
    question_id = ask_resp.json()["question_id"]

    answer_resp = await doctor_client.post(f"/v1/social/qa/{question_id}/answer", json={"answer": "Yes, if you feel well."})
    assert answer_resp.status_code == 200, answer_resp.text
    assert answer_resp.json()["answer"] == "Yes, if you feel well."


@pytest.mark.asyncio
async def test_admin_can_view_moderation_queue(admin_client, doctor_client, qa_payload):
    post_resp = await doctor_client.post("/v1/social/posts", json={"title": "Draft", "body": "Awaiting review"})
    question_resp = await admin_client.post("/v1/social/qa", json=qa_payload)
    assert post_resp.status_code == 201
    assert question_resp.status_code == 201

    queue_resp = await admin_client.get("/v1/social/moderation")
    assert queue_resp.status_code == 200, queue_resp.text
    assert len(queue_resp.json()) >= 1


@pytest.mark.asyncio
async def test_non_creator_cannot_publish_post(patient_client, blog_payload):
    resp = await patient_client.post("/v1/social/posts", json=blog_payload)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_flagged_question_still_visible_until_moderated(patient_client, qa_payload):
    resp = await patient_client.post("/v1/social/qa", json=qa_payload)
    assert resp.status_code == 201, resp.text
    qa = resp.json()
    assert qa["is_anonymous"] is True