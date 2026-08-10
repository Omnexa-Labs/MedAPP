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


# ---------------------------------------------------------------------------
# THE REGRESSION THAT MOTIVATED EVERYTHING BELOW
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_created_post_is_immediately_visible_in_the_feed(doctor_client, patient_client, blog_payload):
    """The bug: nothing created through the API could EVER reach the feed.

    `create_post` wrote `pending`, `list_feed` selects `approved`, and no route
    anywhere approved anything. Six of seven live rows were stranded.

    The old suite missed it because `test_feed_returns_only_approved_posts`
    flips the status BY HAND in the test body - performing the exact step no
    real caller can perform. This test touches the database only through HTTP,
    which is the whole point of it.
    """
    create_resp = await doctor_client.post("/v1/social/posts", json=blog_payload)
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    assert created["moderation_status"] == "approved"
    assert created["published_at"] is not None

    feed_resp = await patient_client.get("/v1/social/feed")
    assert feed_resp.status_code == 200, feed_resp.text
    assert [item["post_id"] for item in feed_resp.json()["items"]] == [created["post_id"]]


@pytest.mark.asyncio
async def test_single_post_route_matches_the_feed_row(doctor_client, patient_client, blog_payload):
    post_id = (await doctor_client.post("/v1/social/posts", json=blog_payload)).json()["post_id"]

    resp = await patient_client.get(f"/v1/social/posts/{post_id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["post_id"] == post_id
    # Same shape as a feed row, so the client reuses one mapper.
    for field in ("like_count", "comment_count", "liked_by_me", "bookmarked_by_me"):
        assert field in body


@pytest.mark.asyncio
async def test_single_post_404s_for_unknown_id(patient_client):
    resp = await patient_client.get("/v1/social/posts/99999999-9999-9999-9999-999999999999")
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# LIKE / UNLIKE
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unlike_is_idempotent(doctor_client, patient_client, blog_payload):
    post_id = (await doctor_client.post("/v1/social/posts", json=blog_payload)).json()["post_id"]
    assert (await patient_client.post(f"/v1/social/posts/{post_id}/react", json={"reaction_type": "like"})).status_code == 201

    first = await patient_client.delete(f"/v1/social/posts/{post_id}/react")
    assert first.status_code == 204, first.text
    # The second delete is the case that matters: a retry or a double tap must
    # not surface a 404 for a state the user already has.
    second = await patient_client.delete(f"/v1/social/posts/{post_id}/react")
    assert second.status_code == 204, second.text

    feed = await patient_client.get("/v1/social/feed")
    assert feed.json()["items"][0]["like_count"] == 0
    assert feed.json()["items"][0]["liked_by_me"] is False


@pytest.mark.asyncio
async def test_liked_by_me_is_per_viewer(doctor_client, patient_client, admin_client, blog_payload):
    """User A's like must not light up for user B.

    The failure mode is a shared cache key or a flag computed from the row
    rather than the caller, and it looks completely normal in a single-user
    test.
    """
    post_id = (await doctor_client.post("/v1/social/posts", json=blog_payload)).json()["post_id"]
    assert (await patient_client.post(f"/v1/social/posts/{post_id}/react", json={"reaction_type": "like"})).status_code == 201

    mine = (await patient_client.get("/v1/social/feed")).json()["items"][0]
    theirs = (await admin_client.get("/v1/social/feed")).json()["items"][0]

    assert mine["liked_by_me"] is True
    assert theirs["liked_by_me"] is False
    # The public count is the same for both - only the viewer flag differs.
    assert mine["like_count"] == theirs["like_count"] == 1


@pytest.mark.asyncio
async def test_anonymous_reader_gets_the_feed_with_flags_false(doctor_client, anonymous_client, blog_payload):
    """No token is not an error on the feed - it is `false` for both flags."""
    await doctor_client.post("/v1/social/posts", json=blog_payload)

    resp = await anonymous_client.get("/v1/social/feed")
    assert resp.status_code == 200, resp.text
    item = resp.json()["items"][0]
    assert item["liked_by_me"] is False
    assert item["bookmarked_by_me"] is False


# ---------------------------------------------------------------------------
# BOOKMARKS
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bookmark_round_trip_and_listing(doctor_client, patient_client, admin_client, blog_payload):
    post_id = (await doctor_client.post("/v1/social/posts", json=blog_payload)).json()["post_id"]

    created = await patient_client.post(f"/v1/social/posts/{post_id}/bookmark")
    assert created.status_code == 201, created.text
    # Idempotent: a second save returns the SAME row, not a 409.
    again = await patient_client.post(f"/v1/social/posts/{post_id}/bookmark")
    assert again.status_code == 201, again.text
    assert again.json()["bookmark_id"] == created.json()["bookmark_id"]

    listed = await patient_client.get("/v1/social/me/bookmarks")
    assert listed.status_code == 200, listed.text
    assert [item["post_id"] for item in listed.json()["items"]] == [post_id]
    assert listed.json()["items"][0]["bookmarked_by_me"] is True

    # Private to the viewer - another user's bookmark list stays empty.
    assert (await admin_client.get("/v1/social/me/bookmarks")).json()["items"] == []

    removed = await patient_client.delete(f"/v1/social/posts/{post_id}/bookmark")
    assert removed.status_code == 204, removed.text
    assert (await patient_client.delete(f"/v1/social/posts/{post_id}/bookmark")).status_code == 204
    assert (await patient_client.get("/v1/social/me/bookmarks")).json()["items"] == []


# ---------------------------------------------------------------------------
# REPORTING
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_report_flags_a_post_and_removes_it_from_the_feed(doctor_client, patient_client, admin_client, blog_payload):
    post_id = (await doctor_client.post("/v1/social/posts", json=blog_payload)).json()["post_id"]
    assert len((await patient_client.get("/v1/social/feed")).json()["items"]) == 1

    report = await patient_client.post(f"/v1/social/posts/{post_id}/report", json={"reason": "misinformation", "note": "Contradicts guidance."})
    assert report.status_code == 201, report.text
    assert report.json()["target_moderation_status"] == "flagged"

    # ONE report is enough. Documented as a hazard, and asserted here so the
    # threshold cannot change silently.
    assert (await patient_client.get("/v1/social/feed")).json()["items"] == []
    # A saved deep link must not still open it, or reporting would be cosmetic.
    assert (await patient_client.get(f"/v1/social/posts/{post_id}")).status_code == 404
    # And it lands in front of a moderator.
    queue = (await admin_client.get("/v1/social/moderation")).json()
    assert any(item["item_id"] == post_id and item["moderation_status"] == "flagged" for item in queue)


@pytest.mark.asyncio
async def test_reporting_twice_is_idempotent(doctor_client, patient_client, blog_payload):
    post_id = (await doctor_client.post("/v1/social/posts", json=blog_payload)).json()["post_id"]
    first = await patient_client.post(f"/v1/social/posts/{post_id}/report", json={"reason": "spam"})
    second = await patient_client.post(f"/v1/social/posts/{post_id}/report", json={"reason": "spam"})
    assert first.status_code == second.status_code == 201, second.text
    assert first.json()["report_id"] == second.json()["report_id"]


@pytest.mark.asyncio
async def test_reporting_a_comment_hides_it_and_drops_the_count(doctor_client, patient_client, blog_payload):
    post_id = (await doctor_client.post("/v1/social/posts", json=blog_payload)).json()["post_id"]
    comment_id = (await patient_client.post(f"/v1/social/posts/{post_id}/comments", json={"body": "Unhelpful."})).json()["comment_id"]
    assert (await patient_client.get("/v1/social/feed")).json()["items"][0]["comment_count"] == 1

    report = await doctor_client.post(f"/v1/social/comments/{comment_id}/report", json={"reason": "abuse"})
    assert report.status_code == 201, report.text

    assert (await patient_client.get(f"/v1/social/posts/{post_id}/comments")).json()["items"] == []
    # The list and the count must never disagree.
    assert (await patient_client.get("/v1/social/feed")).json()["items"][0]["comment_count"] == 0


# ---------------------------------------------------------------------------
# DELETING YOUR OWN CONTENT
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_deleting_someone_elses_post_is_403_not_404(doctor_client, patient_client, blog_payload):
    """403, NOT 404. A 404 would tell the author their post had vanished."""
    post_id = (await doctor_client.post("/v1/social/posts", json=blog_payload)).json()["post_id"]

    forbidden = await patient_client.delete(f"/v1/social/posts/{post_id}")
    assert forbidden.status_code == 403, forbidden.text
    # And the post is still there, which is the half a 404 would have obscured.
    assert (await patient_client.get(f"/v1/social/posts/{post_id}")).status_code == 200

    mine = await doctor_client.delete(f"/v1/social/posts/{post_id}")
    assert mine.status_code == 204, mine.text
    assert (await patient_client.get(f"/v1/social/posts/{post_id}")).status_code == 404


@pytest.mark.asyncio
async def test_deleting_someone_elses_comment_is_403(doctor_client, patient_client, blog_payload):
    post_id = (await doctor_client.post("/v1/social/posts", json=blog_payload)).json()["post_id"]
    comment_id = (await patient_client.post(f"/v1/social/posts/{post_id}/comments", json={"body": "Thanks."})).json()["comment_id"]

    forbidden = await doctor_client.delete(f"/v1/social/posts/{post_id}/comments/{comment_id}")
    assert forbidden.status_code == 403, forbidden.text

    mine = await patient_client.delete(f"/v1/social/posts/{post_id}/comments/{comment_id}")
    assert mine.status_code == 204, mine.text
    assert (await patient_client.get(f"/v1/social/posts/{post_id}/comments")).json()["items"] == []


@pytest.mark.asyncio
async def test_deleting_a_comment_through_the_wrong_post_is_404(doctor_client, patient_client, blog_payload):
    first_id = (await doctor_client.post("/v1/social/posts", json=blog_payload)).json()["post_id"]
    second_id = (await doctor_client.post("/v1/social/posts", json={**blog_payload, "title": "Second"})).json()["post_id"]
    comment_id = (await patient_client.post(f"/v1/social/posts/{first_id}/comments", json={"body": "Here."})).json()["comment_id"]

    resp = await patient_client.delete(f"/v1/social/posts/{second_id}/comments/{comment_id}")
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# ANONYMITY
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_anonymous_post_never_exposes_a_name(doctor_client, patient_client, blog_payload, sessionmaker):
    """The invariant holds in the DATABASE, not in the serialiser."""
    created = (await doctor_client.post("/v1/social/posts", json={**blog_payload, "is_anonymous": True})).json()
    assert created["is_anonymous"] is True
    assert created["author_name"] is None

    feed_item = (await patient_client.get("/v1/social/feed")).json()["items"][0]
    assert feed_item["author_name"] is None
    assert (await patient_client.get(f"/v1/social/posts/{created['post_id']}")).json()["author_name"] is None

    # The column itself is null - the name was never written, not written and
    # filtered out on the way to the client.
    async with sessionmaker() as session:
        row = await session.get(SocialPost, UUID(created["post_id"]))
        assert row.author_name is None


# ---------------------------------------------------------------------------
# PAGINATION
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_feed_next_offset_is_null_on_the_last_page(doctor_client, patient_client, blog_payload):
    for index in range(3):
        resp = await doctor_client.post("/v1/social/posts", json={**blog_payload, "title": f"Post {index}"})
        assert resp.status_code == 201, resp.text

    first = await patient_client.get("/v1/social/feed", params={"limit": 2, "offset": 0})
    assert first.status_code == 200, first.text
    assert len(first.json()["items"]) == 2
    assert first.json()["next_offset"] == 2

    last = await patient_client.get("/v1/social/feed", params={"limit": 2, "offset": 2})
    assert len(last.json()["items"]) == 1
    # Null, not 4. The server proves there is a next page by fetching one extra
    # row; a client inferring "a full page means more" would loop forever on a
    # total that is an exact multiple of the limit.
    assert last.json()["next_offset"] is None


@pytest.mark.asyncio
async def test_comment_list_paginates(doctor_client, patient_client, blog_payload):
    post_id = (await doctor_client.post("/v1/social/posts", json=blog_payload)).json()["post_id"]
    for index in range(3):
        await patient_client.post(f"/v1/social/posts/{post_id}/comments", json={"body": f"Comment {index}"})

    first = await patient_client.get(f"/v1/social/posts/{post_id}/comments", params={"limit": 2})
    assert len(first.json()["items"]) == 2
    assert first.json()["next_offset"] == 2

    last = await patient_client.get(f"/v1/social/posts/{post_id}/comments", params={"limit": 2, "offset": 2})
    assert len(last.json()["items"]) == 1
    assert last.json()["next_offset"] is None


@pytest.mark.asyncio
async def test_limit_over_the_maximum_is_rejected(patient_client):
    resp = await patient_client.get("/v1/social/feed", params={"limit": 500})
    assert resp.status_code == 422, resp.text


# ---------------------------------------------------------------------------
# THREADED REPLIES - exactly two levels, TikTok style (2026-08-08)
# ---------------------------------------------------------------------------


async def _post_with_top_level_comment(doctor_client, patient_client, blog_payload):
    post_id = (await doctor_client.post("/v1/social/posts", json=blog_payload)).json()["post_id"]
    parent = await patient_client.post(f"/v1/social/posts/{post_id}/comments", json={"body": "Top level."})
    assert parent.status_code == 201, parent.text
    return post_id, parent.json()["comment_id"]


@pytest.mark.asyncio
async def test_a_reply_to_a_reply_lands_at_depth_two_not_three(doctor_client, patient_client, blog_payload):
    """THE central invariant. A client naming a reply as the parent must not
    deepen the thread - the new row re-points at that reply's own parent."""
    post_id, parent_id = await _post_with_top_level_comment(doctor_client, patient_client, blog_payload)

    reply = await doctor_client.post(
        f"/v1/social/posts/{post_id}/comments",
        json={"body": "First reply.", "parent_comment_id": parent_id},
    )
    assert reply.status_code == 201, reply.text
    reply_id = reply.json()["comment_id"]
    assert reply.json()["parent_comment_id"] == parent_id

    # Reply to the REPLY. The parent that comes back is the TOP-LEVEL comment,
    # not the reply that was sent.
    deeper = await patient_client.post(
        f"/v1/social/posts/{post_id}/comments",
        json={"body": "Reply to the reply.", "parent_comment_id": reply_id},
    )
    assert deeper.status_code == 201, deeper.text
    assert deeper.json()["parent_comment_id"] == parent_id
    assert deeper.json()["parent_comment_id"] != reply_id

    # ...and who was actually answered is still recorded, which is the whole
    # reason `reply_to_*` exists: at equal depth the parent link cannot say it.
    assert deeper.json()["reply_to_user_id"] == reply.json()["author_user_id"]

    # Both replies hang off the one parent - a flat list of two, not a chain.
    replies = await patient_client.get(f"/v1/social/comments/{parent_id}/replies")
    assert [item["comment_id"] for item in replies.json()["items"]] == [reply_id, deeper.json()["comment_id"]]
    assert all(item["reply_count"] == 0 for item in replies.json()["items"])


@pytest.mark.asyncio
async def test_top_level_list_excludes_replies_but_comment_count_includes_them(doctor_client, patient_client, blog_payload):
    post_id, parent_id = await _post_with_top_level_comment(doctor_client, patient_client, blog_payload)
    for index in range(2):
        await doctor_client.post(
            f"/v1/social/posts/{post_id}/comments",
            json={"body": f"Reply {index}", "parent_comment_id": parent_id},
        )

    listing = await patient_client.get(f"/v1/social/posts/{post_id}/comments")
    assert [item["comment_id"] for item in listing.json()["items"]] == [parent_id]
    assert listing.json()["items"][0]["reply_count"] == 2
    assert listing.json()["items"][0]["parent_comment_id"] is None

    # `comment_count` on the post counts replies too, deliberately - it is the
    # feed card's "how much discussion" number. 1 top-level + 2 replies.
    assert (await patient_client.get(f"/v1/social/posts/{post_id}")).json()["comment_count"] == 3


@pytest.mark.asyncio
async def test_reply_count_excludes_flagged_replies_and_matches_the_list(doctor_client, patient_client, blog_payload):
    """The count and the list are computed from the same predicate. If they can
    drift, "View 2 replies" opens onto one."""
    post_id, parent_id = await _post_with_top_level_comment(doctor_client, patient_client, blog_payload)
    first = await doctor_client.post(
        f"/v1/social/posts/{post_id}/comments",
        json={"body": "Keep me.", "parent_comment_id": parent_id},
    )
    doomed = await doctor_client.post(
        f"/v1/social/posts/{post_id}/comments",
        json={"body": "Report me.", "parent_comment_id": parent_id},
    )
    assert (await patient_client.get(f"/v1/social/posts/{post_id}/comments")).json()["items"][0]["reply_count"] == 2

    doomed_id = doomed.json()["comment_id"]
    flagged = await patient_client.post(f"/v1/social/comments/{doomed_id}/report", json={"reason": "abuse"})
    assert flagged.status_code == 201, flagged.text

    listing = await patient_client.get(f"/v1/social/posts/{post_id}/comments")
    assert listing.json()["items"][0]["reply_count"] == 1
    replies = await patient_client.get(f"/v1/social/comments/{parent_id}/replies")
    assert [item["comment_id"] for item in replies.json()["items"]] == [first.json()["comment_id"]]


@pytest.mark.asyncio
async def test_a_flagged_parent_still_serves_its_replies(doctor_client, patient_client, blog_payload):
    """A report against a parent is not a report against other people's replies,
    and the flagged body is never in this response."""
    post_id, parent_id = await _post_with_top_level_comment(doctor_client, patient_client, blog_payload)
    reply = await doctor_client.post(
        f"/v1/social/posts/{post_id}/comments",
        json={"body": "Mine, unreported.", "parent_comment_id": parent_id},
    )

    await doctor_client.post(f"/v1/social/comments/{parent_id}/report", json={"reason": "abuse"})

    # The thread is gone from the top-level list, whole - not silently shortened.
    assert (await patient_client.get(f"/v1/social/posts/{post_id}/comments")).json()["items"] == []
    still = await patient_client.get(f"/v1/social/comments/{parent_id}/replies")
    assert still.status_code == 200, still.text
    assert [item["comment_id"] for item in still.json()["items"]] == [reply.json()["comment_id"]]


@pytest.mark.asyncio
async def test_replies_paginate_and_next_offset_is_null_on_the_last_page(doctor_client, patient_client, blog_payload):
    post_id, parent_id = await _post_with_top_level_comment(doctor_client, patient_client, blog_payload)
    for index in range(3):
        await doctor_client.post(
            f"/v1/social/posts/{post_id}/comments",
            json={"body": f"Reply {index}", "parent_comment_id": parent_id},
        )

    first = await patient_client.get(f"/v1/social/comments/{parent_id}/replies", params={"limit": 2})
    assert first.status_code == 200, first.text
    assert len(first.json()["items"]) == 2
    assert first.json()["next_offset"] == 2

    last = await patient_client.get(f"/v1/social/comments/{parent_id}/replies", params={"limit": 2, "offset": 2})
    assert len(last.json()["items"]) == 1
    # Null, not 4. A client inferring "a full page means more" loops forever on
    # a total that is an exact multiple of the limit.
    assert last.json()["next_offset"] is None


@pytest.mark.asyncio
async def test_replies_of_a_reply_id_resolve_to_the_same_thread(doctor_client, patient_client, blog_payload):
    """Read mirrors write: an id at depth 2 resolves to the row above it, rather
    than returning an empty list that reads exactly like a real answer."""
    post_id, parent_id = await _post_with_top_level_comment(doctor_client, patient_client, blog_payload)
    reply_id = (
        await doctor_client.post(
            f"/v1/social/posts/{post_id}/comments",
            json={"body": "A reply.", "parent_comment_id": parent_id},
        )
    ).json()["comment_id"]

    by_parent = await patient_client.get(f"/v1/social/comments/{parent_id}/replies")
    by_reply = await patient_client.get(f"/v1/social/comments/{reply_id}/replies")
    assert by_reply.status_code == 200, by_reply.text
    assert by_reply.json() == by_parent.json()
    assert len(by_reply.json()["items"]) == 1


@pytest.mark.asyncio
async def test_deleting_a_parent_deletes_its_replies(doctor_client, patient_client, blog_payload):
    """CASCADE, as documented. Explicitly deleted in the service layer rather
    than left to the FK, because SQLite has foreign keys off by default and
    would otherwise prove orphans fine here while Postgres cascades live."""
    post_id, parent_id = await _post_with_top_level_comment(doctor_client, patient_client, blog_payload)
    await doctor_client.post(
        f"/v1/social/posts/{post_id}/comments",
        json={"body": "Goes with it.", "parent_comment_id": parent_id},
    )
    assert (await patient_client.get(f"/v1/social/posts/{post_id}")).json()["comment_count"] == 2

    # The patient wrote the top-level comment, so the patient may delete it.
    removed = await patient_client.delete(f"/v1/social/posts/{post_id}/comments/{parent_id}")
    assert removed.status_code == 204, removed.text

    assert (await patient_client.get(f"/v1/social/posts/{post_id}/comments")).json()["items"] == []
    # The reply is GONE, not orphaned into a top-level comment and not left
    # inflating the count.
    assert (await patient_client.get(f"/v1/social/posts/{post_id}")).json()["comment_count"] == 0
    assert (await patient_client.get(f"/v1/social/comments/{parent_id}/replies")).status_code == 404


@pytest.mark.asyncio
async def test_an_anonymous_parent_is_never_named_in_a_reply(doctor_client, patient_client, blog_payload, sessionmaker):
    """THE ANONYMITY INVARIANT, one column over.

    `author_name IS NULL` is how this service spells "not to be named". A reply
    must COPY that null, never re-resolve the name - a name minted here would
    live on a different row, one no anonymity filter in this service inspects.
    """
    from app.models.social import PostComment

    post_id, parent_id = await _post_with_top_level_comment(doctor_client, patient_client, blog_payload)
    async with sessionmaker() as session:
        parent = await session.get(PostComment, UUID(parent_id))
        parent.author_name = None
        await session.commit()

    reply = await doctor_client.post(
        f"/v1/social/posts/{post_id}/comments",
        json={"body": "Answering you.", "parent_comment_id": parent_id},
    )
    assert reply.status_code == 201, reply.text
    assert reply.json()["reply_to_name"] is None

    # And it stays null in the DB, not only on the way out.
    async with sessionmaker() as session:
        stored = await session.get(PostComment, UUID(reply.json()["comment_id"]))
        assert stored.reply_to_name is None

    listed = await patient_client.get(f"/v1/social/comments/{parent_id}/replies")
    assert listed.json()["items"][0]["reply_to_name"] is None


@pytest.mark.asyncio
async def test_a_named_parent_is_carried_into_the_reply_prefix(doctor_client, patient_client, blog_payload, sessionmaker):
    """The other direction: when the parent HAS a name, the @prefix gets it."""
    from app.models.social import PostComment

    post_id, parent_id = await _post_with_top_level_comment(doctor_client, patient_client, blog_payload)
    async with sessionmaker() as session:
        parent = await session.get(PostComment, UUID(parent_id))
        parent.author_name = "Ama Mensah"
        await session.commit()

    reply = await doctor_client.post(
        f"/v1/social/posts/{post_id}/comments",
        json={"body": "Answering you.", "parent_comment_id": parent_id},
    )
    assert reply.json()["reply_to_name"] == "Ama Mensah"


@pytest.mark.asyncio
async def test_deleting_someone_elses_reply_is_403(doctor_client, patient_client, blog_payload):
    post_id, parent_id = await _post_with_top_level_comment(doctor_client, patient_client, blog_payload)
    reply_id = (
        await doctor_client.post(
            f"/v1/social/posts/{post_id}/comments",
            json={"body": "The doctor's reply.", "parent_comment_id": parent_id},
        )
    ).json()["comment_id"]

    forbidden = await patient_client.delete(f"/v1/social/posts/{post_id}/comments/{reply_id}")
    # 403, NOT 404 - a 404 would tell the author their reply had vanished.
    assert forbidden.status_code == 403, forbidden.text
    assert forbidden.json()["detail"] == "not the author of this comment"

    # Still there, and still counted.
    assert (await patient_client.get(f"/v1/social/posts/{post_id}/comments")).json()["items"][0]["reply_count"] == 1


@pytest.mark.asyncio
async def test_a_parent_from_another_post_is_404(doctor_client, patient_client, blog_payload):
    """A reply cannot be smuggled onto a thread it does not belong to."""
    _, parent_id = await _post_with_top_level_comment(doctor_client, patient_client, blog_payload)
    other_post_id = (await doctor_client.post("/v1/social/posts", json={**blog_payload, "title": "Other"})).json()["post_id"]

    mismatched = await patient_client.post(
        f"/v1/social/posts/{other_post_id}/comments",
        json={"body": "Wrong thread.", "parent_comment_id": parent_id},
    )
    assert mismatched.status_code == 404, mismatched.text
    assert mismatched.json()["detail"] == "parent comment not found"


@pytest.mark.asyncio
async def test_replies_of_an_unknown_comment_are_404(patient_client):
    """404, not an empty list. "No replies yet" and "no such comment" are
    different answers and must not look the same."""
    resp = await patient_client.get("/v1/social/comments/11111111-2222-3333-4444-555555555555/replies")
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# Anonymity: the ID, not just the name
#
# Withholding `author_name` was never enough. `author_user_id` is STABLE and is
# returned in full on the same author's attributed posts and on every comment
# they write, where the name IS present. So an anonymous post plus any one
# attributed row from that author, joined on the id, names them - two ordinary
# reads and no privileged access. These cases pin both directions.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_anonymous_post_withholds_the_author_id(doctor_client, patient_client, blog_payload, sessionmaker):
    created = (await doctor_client.post("/v1/social/posts", json={**blog_payload, "is_anonymous": True})).json()
    assert created["author_user_id"] is None

    post_id = created["post_id"]
    assert (await patient_client.get(f"/v1/social/posts/{post_id}")).json()["author_user_id"] is None
    feed_item = (await patient_client.get("/v1/social/feed")).json()["items"][0]
    assert feed_item["author_user_id"] is None

    # The row still HAS the author - this is a serialisation boundary, not data
    # loss. Moderation and ownership both still depend on the column.
    async with sessionmaker() as session:
        row = await session.get(SocialPost, UUID(post_id))
        assert row.author_user_id is not None


@pytest.mark.asyncio
async def test_attributed_post_still_returns_the_author_id(doctor_client, patient_client, blog_payload):
    """The other direction. A fix that nulls the id everywhere is not a fix."""
    created = (await doctor_client.post("/v1/social/posts", json={**blog_payload, "is_anonymous": False})).json()
    assert created["author_user_id"] is not None
    fetched = (await patient_client.get(f"/v1/social/posts/{created['post_id']}")).json()
    assert fetched["author_user_id"] == created["author_user_id"]


@pytest.mark.asyncio
async def test_the_author_of_an_anonymous_post_can_still_delete_it(doctor_client, patient_client, blog_payload):
    """The reason `owned_by_me` exists.

    With the id withheld the client has nothing to compare, so ownership has to
    be answered by the server or the one person entitled to delete an anonymous
    post loses the affordance.
    """
    created = (await doctor_client.post("/v1/social/posts", json={**blog_payload, "is_anonymous": True})).json()
    post_id = created["post_id"]

    mine = (await doctor_client.get(f"/v1/social/posts/{post_id}")).json()
    assert mine["author_user_id"] is None
    assert mine["owned_by_me"] is True

    theirs = (await patient_client.get(f"/v1/social/posts/{post_id}")).json()
    assert theirs["owned_by_me"] is False

    assert (await patient_client.delete(f"/v1/social/posts/{post_id}")).status_code == 403
    assert (await doctor_client.delete(f"/v1/social/posts/{post_id}")).status_code == 204


@pytest.mark.asyncio
async def test_anonymous_question_withholds_the_author_id(patient_client):
    """Questions default to anonymous and are the most sensitive rows here."""
    created = (await patient_client.post("/v1/social/qa", json={"question": "Is this normal?"})).json()
    assert created["is_anonymous"] is True
    assert created["author_user_id"] is None

    listed = (await patient_client.get("/v1/social/qa")).json()
    assert all(q["author_user_id"] is None for q in listed if q["is_anonymous"])


@pytest.mark.asyncio
async def test_attributed_question_still_returns_the_author_id(patient_client):
    created = (
        await patient_client.post("/v1/social/qa", json={"question": "Happy to be named.", "is_anonymous": False})
    ).json()
    assert created["is_anonymous"] is False
    assert created["author_user_id"] is not None
