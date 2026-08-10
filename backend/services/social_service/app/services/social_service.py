from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete as sa_delete, literal, select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from shared.auth import Principal

from .identity import resolve_display_name
from ..models import ContentReport, ModerationStatus, PostBookmark, PostComment, PostReaction, PostKind, SocialPost, SocialQuestion
from ..schemas.social import CommentCreate, PostCreate, QAAnswerCreate, QAQuestionCreate, ReactionCreate, ReportCreate

# Paging defaults, shared by the feed, the comment list and the bookmark list so
# a client can use one page size everywhere.
DEFAULT_PAGE_LIMIT = 20
MAX_PAGE_LIMIT = 100

TARGET_POST = "post"
TARGET_COMMENT = "comment"


class SocialError(ValueError):
    pass


class SocialForbidden(SocialError):
    """The caller is authenticated but not entitled to act on this row.

    A separate type from `SocialError` because the router maps that one to 404,
    and an ownership failure MUST NOT come back as 404. "This does not exist"
    and "this exists and is not yours" are different answers, and collapsing
    them would tell a user their own post had vanished.
    """


def _principal_uuid(principal: Principal) -> UUID:
    try:
        return UUID(principal.subject)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid principal subject") from exc


def _viewer_uuid(principal: Principal | None) -> UUID | None:
    """The caller's id, or None when nobody is signed in.

    Unlike `_principal_uuid` this never raises: an unparseable subject on a
    route that merely DECORATES the response with viewer state should degrade to
    "not liked", not 401 a reader out of the feed.
    """
    if principal is None:
        return None
    try:
        return UUID(principal.subject)
    except ValueError:
        return None


def _clamp_limit(limit: int | None) -> int:
    if limit is None:
        return DEFAULT_PAGE_LIMIT
    return max(1, min(int(limit), MAX_PAGE_LIMIT))


def _viewer_flag_columns(viewer_id: UUID | None):
    """`(liked_by_me, bookmarked_by_me)` as correlated EXISTS subqueries.

    EXISTS, not COUNT and not an outer join. Two outer joins against child
    tables would multiply rows the way a counting join does; EXISTS stops at the
    first match and keeps one row per post, matching how `like_count` and
    `comment_count` are already built above.

    With no viewer these become SQL literals rather than a subquery against a
    null user id - `user_id = NULL` is never true, so it would work by accident,
    and a literal says what is meant.
    """
    if viewer_id is None:
        return literal(False), literal(False)
    liked = (
        select(literal(1))
        .where(PostReaction.post_id == SocialPost.id)
        .where(PostReaction.user_id == viewer_id)
        .correlate(SocialPost)
        .exists()
    )
    bookmarked = (
        select(literal(1))
        .where(PostBookmark.post_id == SocialPost.id)
        .where(PostBookmark.user_id == viewer_id)
        .correlate(SocialPost)
        .exists()
    )
    return liked, bookmarked


def _like_count_column():
    """Reactions on a post.

    COUNTS EVERY REACTION TYPE, not just `like`. A "love" or "insightful"
    increments what the client renders as a like count. Kept as-is because the
    feed card shows a single engagement number and every reaction is engagement;
    documented in docs/api/social_service.md so nobody reads the field name as a
    promise about `reaction_type`.
    """
    return (
        select(func.count(PostReaction.id))
        .where(PostReaction.post_id == SocialPost.id)
        .correlate(SocialPost)
        .scalar_subquery()
    )


def _comment_count_column():
    """APPROVED comments only - a pending or flagged comment must not inflate a
    number that implies it was published. See `list_comments`.

    COUNTS REPLIES TOO. A reply is a row in `post_comments` with the same
    `post_id`, and nothing here excludes it. That is deliberate: the feed card
    shows one number for "how much discussion is on this post", and a reply is
    discussion. It does mean `comment_count` is larger than the number of items
    `GET /posts/{id}/comments` returns, because that list is top-level only -
    stated here and in the contract doc so nobody reads the two as the same
    quantity and "fixes" one of them.
    """
    return (
        select(func.count(PostComment.id))
        .where(PostComment.post_id == SocialPost.id)
        .where(PostComment.moderation_status == ModerationStatus.APPROVED.value)
        .correlate(SocialPost)
        .scalar_subquery()
    )


# Self-join alias: `reply_count` counts rows of `post_comments` correlated
# against another row of `post_comments`, so the inner side needs its own name.
_Reply = aliased(PostComment, name="reply")


def _reply_count_column():
    """Approved replies under a comment, as a correlated scalar subquery.

    NOT A STORED COUNTER, deliberately. This service has no counter column on
    any table, and every count it serves (`like_count`, `comment_count`) is
    computed this way. A stored `reply_count` would need a writer on insert, on
    delete, on report and on any future un-report - and a counter with a missing
    writer drifts silently and reads as a plausible number, which is the failure
    mode this repo has already documented once. Correlated subqueries cannot
    drift; they are recomputed from the rows themselves.

    APPROVED ONLY, exactly matching what `list_replies` returns, so the
    "View 3 replies" affordance and the list behind it can never disagree. A
    flagged reply is invisible in both.
    """
    return (
        select(func.count(_Reply.id))
        .where(_Reply.parent_comment_id == PostComment.id)
        .where(_Reply.moderation_status == ModerationStatus.APPROVED.value)
        .correlate(PostComment)
        .scalar_subquery()
    )


def _attach_reply_counts(rows) -> list[PostComment]:
    """Hang `reply_count` on the comment rows, like `_attach_engagement`.

    A plain attribute, not a mapped column. The router must list it explicitly
    when it builds `CommentOut` from a dict - see `_comment_out`.
    """
    comments: list[PostComment] = []
    for comment, replies in rows:
        comment.reply_count = int(replies or 0)
        comments.append(comment)
    return comments


def _attach_engagement(rows, viewer: UUID | None = None) -> list[SocialPost]:
    """Hang the aggregate and per-viewer columns on the ORM instances.

    Plain attributes, not mapped columns: nothing is persisted or invalidated by
    setting them. The routers must still list every one of these explicitly when
    they build `PostOut` from a dict - see the note in routers/social.py.

    `owned_by_me` is computed HERE, from the viewer, rather than left to the
    client comparing ids. It exists because `author_user_id` is now withheld on
    anonymous posts (see `_anonymised_author_id`), and without it the author of
    an anonymous post would lose the ability to delete it - the client would have
    nothing to compare. Answering the ownership question on the server is what
    lets the id stay in the database where it belongs.
    """
    posts: list[SocialPost] = []
    for post, likes, comments, liked, bookmarked in rows:
        post.like_count = int(likes or 0)
        post.comment_count = int(comments or 0)
        post.liked_by_me = bool(liked)
        post.bookmarked_by_me = bool(bookmarked)
        post.owned_by_me = viewer is not None and post.author_user_id == viewer
        posts.append(post)
    return posts


def _normalize_tags(tags: list[str] | None) -> list[str]:
    return [tag.strip().lower() for tag in tags or [] if tag.strip()]


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _ensure_creator_access(principal: Principal) -> None:
    if principal.role not in {"doctor", "hospital_admin", "platform_admin", "admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "creator access required")


def _ensure_question_access(principal: Principal) -> None:
    if principal.role not in {"patient", "user", "doctor", "nurse", "hospital_admin", "platform_admin", "admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "question access required")


def _ensure_answer_access(principal: Principal) -> None:
    if principal.role not in {"doctor", "admin", "platform_admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "doctor access required")


def _ensure_moderation_access(principal: Principal) -> None:
    if principal.role not in {"hospital_admin", "platform_admin", "admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "moderation access required")


async def create_post(
    db: AsyncSession,
    principal: Principal,
    payload: PostCreate,
    authorization: str | None = None,
) -> SocialPost:
    _ensure_creator_access(principal)
    now = datetime.now(tz=UTC)

    # Snapshot the author display name, EXCEPT on an anonymous post.
    #
    # Not stored at all when anonymous - not stored-and-hidden. A name that
    # exists in the row is a name that a future query, export, admin screen or
    # log line can leak. Anonymity on a health forum has to hold in the
    # database, not just in the serialiser.
    author_name = None
    if not payload.is_anonymous:
        author_name = await resolve_display_name(str(_principal_uuid(principal)), authorization)
    post = SocialPost(
        kind=PostKind.BLOG.value,
        author_user_id=_principal_uuid(principal),
        author_role=principal.role,
        author_name=author_name,
        title=payload.title.strip(),
        body=payload.body.strip(),
        excerpt=_normalize_text(payload.excerpt),
        tags=_normalize_tags(payload.tags),
        is_anonymous=payload.is_anonymous,
        # AUTO-PUBLISH. This was PENDING with `published_at=None`, and `list_feed`
        # filters `moderation_status == APPROVED` - while NO route anywhere ever
        # set a post to approved. Every post created through the API was
        # therefore invisible forever, in a service whose only read surface is
        # the feed. Six of seven rows in the live database were stranded.
        #
        # Moderation is now REPORT-DRIVEN (see `create_report`): content is
        # published on write and pulled back to FLAGGED when someone reports it,
        # rather than held until a reviewer who had no route to act arrives.
        # That trade is deliberate and is written up as a hazard in the contract
        # doc - it means unreviewed health content is publicly readable the
        # instant it is written.
        moderation_status=ModerationStatus.APPROVED.value,
        published_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(post)
    await db.flush()
    await db.refresh(post)
    return post


async def list_feed(
    db: AsyncSession,
    principal: Principal | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> tuple[list[SocialPost], int | None]:
    """The public blog feed, with engagement counts and per-viewer flags.

    COUNTS ARE CORRELATED SUBQUERIES, not a join with GROUP BY, and not a
    per-post query. A join against two child tables would multiply rows
    (a post with 3 likes and 2 comments yields 6) and force a DISTINCT; a
    per-post count is the N+1 this method exists to avoid. Scalar subqueries
    keep it a single round trip and one row per post. `liked_by_me` and
    `bookmarked_by_me` follow the same shape as EXISTS.

    Only APPROVED comments are counted. This is patient-written health content
    and the feed card is a public surface: a pending or flagged comment must not
    inflate a number that implies it was published. Reactions have no moderation
    state, so all of them count - INCLUDING non-`like` types, see
    `_like_count_column`.

    `principal` is OPTIONAL. The feed is readable without a token and stays that
    way; an anonymous caller simply gets `false` for both viewer flags.

    PAGING IS OFFSET-BASED, and returns `(posts, next_offset)`. `next_offset` is
    None on the last page, decided by fetching one row more than asked for and
    discarding it - a client that instead infers "a full page means there is
    more" pages forever whenever the total is an exact multiple of the limit.

    Offset, not a keyset cursor, because the sort key pair
    `(published_at, created_at)` IS NOT UNIQUE - two posts published in the same
    transaction share both - so a cursor would need `id` as a tiebreaker and a
    composite comparison. The known cost is the usual one: a row inserted while
    the reader pages can shift the window and repeat or skip an item.

    Everything is attached as plain attributes on the ORM instance rather than
    mapped columns; nothing is persisted or invalidated by doing so.
    """
    page = _clamp_limit(limit)
    offset = max(0, int(offset))
    liked, bookmarked = _viewer_flag_columns(_viewer_uuid(principal))

    stmt = (
        select(
            SocialPost,
            _like_count_column().label("like_count"),
            _comment_count_column().label("comment_count"),
            liked.label("liked_by_me"),
            bookmarked.label("bookmarked_by_me"),
        )
        .where(SocialPost.kind == PostKind.BLOG.value)
        .where(SocialPost.moderation_status == ModerationStatus.APPROVED.value)
        .order_by(SocialPost.published_at.desc().nullslast(), SocialPost.created_at.desc())
        .offset(offset)
        # One extra row, discarded below: it is the evidence that a next page
        # exists, and costs a row instead of a second COUNT(*) query.
        .limit(page + 1)
    )
    rows = (await db.execute(stmt)).all()

    has_more = len(rows) > page
    posts = _attach_engagement(rows[:page], _viewer_uuid(principal))
    return posts, (offset + page if has_more else None)


async def get_post(db: AsyncSession, post_id: UUID, principal: Principal | None = None) -> SocialPost:
    """One post, shaped exactly like a feed row.

    Same counts and the same per-viewer flags, so the client can reuse its feed
    mapper and a deep link renders identically to the card it came from.

    404s for a post that is not APPROVED, not just for a missing one. A flagged
    post is gone from the feed; letting a saved link still open it would make
    reporting cosmetic. The author of a flagged post gets 404 here too - a
    "your post was hidden" view is a real feature, but it needs its own route
    and its own product decision, not a quiet exception in the public read.
    """
    liked, bookmarked = _viewer_flag_columns(_viewer_uuid(principal))
    stmt = (
        select(
            SocialPost,
            _like_count_column().label("like_count"),
            _comment_count_column().label("comment_count"),
            liked.label("liked_by_me"),
            bookmarked.label("bookmarked_by_me"),
        )
        .where(SocialPost.id == post_id)
        .where(SocialPost.kind == PostKind.BLOG.value)
        .where(SocialPost.moderation_status == ModerationStatus.APPROVED.value)
    )
    rows = (await db.execute(stmt)).all()
    if not rows:
        raise SocialError("post not found")
    return _attach_engagement(rows, _viewer_uuid(principal))[0]


def _reply_to_name(target: PostComment) -> str | None:
    """The name to put in a reply's "@" prefix, or None.

    THE ANONYMITY GUARD, in one place so there is one place to audit.

    It returns the target row's ALREADY-STORED `author_name` and nothing else.
    It never calls user_service, and it never falls back to `author_user_id`.

    That matters because `author_name IS NULL` is how this service spells
    "this author is not to be named" - anonymous content never has a name
    written to its row at all (see `create_post`), and the profile-rename
    consumer refuses to write one into a null. If a reply re-resolved the name
    instead of copying it, replying to anonymous content would mint the very
    name the author's anonymity depends on not existing, and it would then live
    on a DIFFERENT row - one no anonymity filter anywhere in this service looks
    at. Null in, null out.

    A null also arises from a plain failed lookup, and the two are deliberately
    NOT distinguished here: both mean "we cannot name this person", and the
    client renders no prefix for either.
    """
    return target.author_name


async def create_comment(db: AsyncSession, principal: Principal, post_id: UUID, payload: CommentCreate, authorization: str | None = None) -> PostComment:
    """Comment on a post, or reply to a comment on it.

    THREADS ARE EXACTLY TWO LEVELS DEEP, AND THAT IS ENFORCED HERE.

    If `parent_comment_id` names a top-level comment, the new row attaches to
    it. If it names a REPLY, the new row attaches to that reply's OWN parent
    instead - same thread, same depth, one level down from the top and no
    further. The nesting never grows, whatever the client sends.

    Server-side, not client-side, and not negotiable: this is a data invariant,
    and an invariant a client can decline to apply is not an invariant. There
    will be more than one client (mobile today, web and any future integration
    later), each free to be old, buggy or hostile, and a single one of them
    passing through a reply's id would put a row in the table that every reader
    - the top-level list, `reply_count`, the replies route - would then have to
    cope with forever. Unbounded nesting is also what makes a comment thread
    unreadable on a phone, which is the product reason the rule exists at all.

    The parent is checked against THIS post, like `delete_comment` checks its
    own path id: a parent id belonging to another post is a 404, so a reply
    cannot be smuggled onto a thread it does not belong to.

    `reply_to_user_id`/`reply_to_name` record the comment actually being
    answered, which is NOT always the parent - when you reply to a reply, the
    parent is the top-level comment while the person you answered is the
    sibling. That is precisely why both fields exist: at equal depth, the parent
    link alone cannot say who was meant. See `_reply_to_name` for the anonymity
    guard on the name.
    """
    post = await db.get(SocialPost, post_id)
    if post is None or post.kind != PostKind.BLOG.value:
        raise SocialError("post not found")

    parent_comment_id: UUID | None = None
    reply_to_user_id: UUID | None = None
    reply_to_name: str | None = None

    if payload.parent_comment_id is not None:
        target = await db.get(PostComment, payload.parent_comment_id)
        if target is None or target.post_id != post_id:
            raise SocialError("parent comment not found")
        # THE ONE-LEVEL RULE. A reply's parent is already top-level, so reusing
        # it keeps the new row at depth 2. A top-level target becomes the parent
        # directly. Either way `parent_comment_id` always points at a row whose
        # own `parent_comment_id` is NULL.
        parent_comment_id = target.parent_comment_id or target.id
        # The person answered is the comment that was named, NOT the resolved
        # parent - flattening the structure must not also flatten who was
        # addressed.
        reply_to_user_id = target.author_user_id
        reply_to_name = _reply_to_name(target)

    comment = PostComment(
        post_id=post_id,
        author_user_id=_principal_uuid(principal),
        author_role=principal.role,
        # Non-fatal: a failed lookup leaves the name null rather than losing
        # what someone wrote. See services/identity.py.
        author_name=await resolve_display_name(str(_principal_uuid(principal)), authorization),
        body=payload.body.strip(),
        moderation_status=ModerationStatus.APPROVED.value,
        parent_comment_id=parent_comment_id,
        reply_to_user_id=reply_to_user_id,
        reply_to_name=reply_to_name,
    )
    db.add(comment)
    await db.flush()
    await db.refresh(comment)
    # Trivially true and stated rather than defaulted: a row that was created
    # one statement ago has no replies, and by the one-level rule a reply never
    # will. See the note in `_post_out` about defaults that look like answers.
    comment.reply_count = 0
    return comment


async def create_reaction(db: AsyncSession, principal: Principal, post_id: UUID, payload: ReactionCreate) -> PostReaction:
    post = await db.get(SocialPost, post_id)
    if post is None or post.kind != PostKind.BLOG.value:
        raise SocialError("post not found")
    existing = await db.scalar(select(PostReaction).where(PostReaction.post_id == post_id, PostReaction.user_id == _principal_uuid(principal)))
    if existing is not None:
        existing.reaction_type = payload.reaction_type.strip().lower()
        await db.flush()
        await db.refresh(existing)
        return existing
    reaction = PostReaction(
        post_id=post_id,
        user_id=_principal_uuid(principal),
        user_role=principal.role,
        reaction_type=payload.reaction_type.strip().lower(),
    )
    db.add(reaction)
    await db.flush()
    await db.refresh(reaction)
    return reaction


async def delete_reaction(db: AsyncSession, principal: Principal, post_id: UUID) -> None:
    """Un-like. IDEMPOTENT: deleting a reaction that is not there is a 204.

    Not a 404. The client's like button is a toggle over a network, and the
    honest answer to "make sure my reaction is gone" is "it is gone" whether or
    not it was there a moment ago. A 404 on the second tap of a double tap, or
    on a retry after a timeout, would surface an error for a state the user
    already has.

    The POST that is missing is NOT the post's existence check - a reaction on a
    deleted post cascades away with it, so there is nothing to clean up and
    nothing to 404 about.
    """
    await db.execute(
        sa_delete(PostReaction)
        .where(PostReaction.post_id == post_id)
        .where(PostReaction.user_id == _principal_uuid(principal))
    )
    await db.flush()


async def create_bookmark(db: AsyncSession, principal: Principal, post_id: UUID) -> PostBookmark:
    """Save a post. IDEMPOTENT: re-bookmarking returns the EXISTING row, 201.

    Not a 409. A bookmark is a desired end state, not an event, and the second
    tap of a flaky double tap should leave the user saved rather than shown an
    error about a thing that already worked.

    Unknown post 404s, unlike un-bookmarking: creating a pointer to nothing is a
    client bug worth surfacing.
    """
    post = await db.get(SocialPost, post_id)
    if post is None or post.kind != PostKind.BLOG.value:
        raise SocialError("post not found")
    user_id = _principal_uuid(principal)
    existing = await db.scalar(
        select(PostBookmark).where(PostBookmark.post_id == post_id, PostBookmark.user_id == user_id)
    )
    if existing is not None:
        return existing
    bookmark = PostBookmark(post_id=post_id, user_id=user_id)
    db.add(bookmark)
    await db.flush()
    await db.refresh(bookmark)
    return bookmark


async def delete_bookmark(db: AsyncSession, principal: Principal, post_id: UUID) -> None:
    """Unsave. IDEMPOTENT, for the same reason as `delete_reaction`."""
    await db.execute(
        sa_delete(PostBookmark)
        .where(PostBookmark.post_id == post_id)
        .where(PostBookmark.user_id == _principal_uuid(principal))
    )
    await db.flush()


async def list_bookmarks(
    db: AsyncSession,
    principal: Principal,
    limit: int | None = None,
    offset: int = 0,
) -> tuple[list[SocialPost], int | None]:
    """The caller's saved posts, newest-BOOKMARKED first.

    Ordered by when it was SAVED, not when it was published: this is a reading
    list, and the thing you just saved belongs at the top even if the post is
    old.

    Returns the same `(posts, next_offset)` pair and the same attached counts
    and flags as `list_feed`, so the route can hand back a `PostList` and the
    client can reuse its feed mapper unchanged.

    APPROVED ONLY, joined through the feed's own filter. A post that was
    reported after you saved it disappears from here too - a bookmark must not
    become a private back door to flagged content.
    """
    page = _clamp_limit(limit)
    offset = max(0, int(offset))
    user_id = _principal_uuid(principal)
    liked, bookmarked = _viewer_flag_columns(user_id)

    stmt = (
        select(
            SocialPost,
            _like_count_column().label("like_count"),
            _comment_count_column().label("comment_count"),
            liked.label("liked_by_me"),
            bookmarked.label("bookmarked_by_me"),
        )
        .join(PostBookmark, PostBookmark.post_id == SocialPost.id)
        .where(PostBookmark.user_id == user_id)
        .where(SocialPost.kind == PostKind.BLOG.value)
        .where(SocialPost.moderation_status == ModerationStatus.APPROVED.value)
        .order_by(PostBookmark.created_at.desc())
        .offset(offset)
        .limit(page + 1)
    )
    rows = (await db.execute(stmt)).all()

    has_more = len(rows) > page
    posts = _attach_engagement(rows[:page], _viewer_uuid(principal))
    return posts, (offset + page if has_more else None)


async def create_report(
    db: AsyncSession,
    principal: Principal,
    target_type: str,
    target_id: UUID,
    payload: ReportCreate,
) -> ContentReport:
    """Report a post or a comment, and FLAG it.

    This is the only writer of `ModerationStatus.FLAGGED`, which the moderation
    queue has read since day one while nothing ever set it.

    ONE REPORT HIDES THE ITEM. There is no threshold and no score. That is a
    real hazard - a single malicious user can remove any post from the feed -
    and it is chosen knowingly: the alternative, leaving reported health content
    up until a quorum arrives, is the worse failure on a patient forum, and the
    moderation queue already surfaces flagged items for a human to restore.
    Raising the bar later is a threshold in this function and a migration for
    nothing else. It is written up in docs/api/social_service.md.

    Reporting your OWN content is allowed, with no special case. "I posted this
    and want it taken down" is a legitimate use, and the author can already
    delete outright.

    Re-reporting is IDEMPOTENT: the unique constraint means one report per user
    per item, and a repeat returns the original rather than 409ing. The target
    is re-flagged either way, so a report is never a no-op against an item some
    moderator has since restored.
    """
    if target_type == TARGET_POST:
        target = await db.get(SocialPost, target_id)
        if target is None or target.kind != PostKind.BLOG.value:
            raise SocialError("post not found")
    elif target_type == TARGET_COMMENT:
        target = await db.get(PostComment, target_id)
        if target is None:
            raise SocialError("comment not found")
    else:  # pragma: no cover - the routes pass literals
        raise SocialError("unknown target type")

    target.moderation_status = ModerationStatus.FLAGGED.value

    reporter_id = _principal_uuid(principal)
    existing = await db.scalar(
        select(ContentReport)
        .where(ContentReport.reporter_user_id == reporter_id)
        .where(ContentReport.target_type == target_type)
        .where(ContentReport.target_id == target_id)
    )
    if existing is not None:
        await db.flush()
        return existing

    report = ContentReport(
        reporter_user_id=reporter_id,
        target_type=target_type,
        target_id=target_id,
        reason=payload.reason.strip(),
        note=_normalize_text(payload.note),
    )
    db.add(report)
    await db.flush()
    await db.refresh(report)
    return report


async def delete_post(db: AsyncSession, principal: Principal, post_id: UUID) -> None:
    """Author deletes their own post. 403 for anyone else's.

    403, NOT 404. Hiding the existence of a row the caller cannot touch is the
    right call when existence is itself a secret; a post on a public feed is not
    that, and answering 404 would tell an author their post had disappeared.

    HARD DELETE. This service has no soft-delete column on any table, and
    inventing one here would leave `social_posts` deletable two ways with only
    one of them respected by every existing query - including `list_feed`, the
    moderation queue, and the event consumer that rewrites author names. The
    cost is that the row and its comments are unrecoverable; comments and
    reactions cascade by FK. `content_reports` deliberately does NOT cascade, so
    the audit trail outlives the content.

    NO ADMIN OVERRIDE. A moderator cannot delete through this route - flagging
    is the moderator's tool. Deliberate, and recorded as a gap.
    """
    post = await db.get(SocialPost, post_id)
    if post is None or post.kind != PostKind.BLOG.value:
        raise SocialError("post not found")
    if post.author_user_id != _principal_uuid(principal):
        raise SocialForbidden("not the author of this post")
    await db.delete(post)
    await db.flush()


async def delete_comment(db: AsyncSession, principal: Principal, post_id: UUID, comment_id: UUID) -> None:
    """Author deletes their own comment. 403 for anyone else's.

    The post id in the path is CHECKED, not decorative: a comment id under the
    wrong post is a 404, so a client cannot delete a comment by guessing an id
    against an unrelated post it happens to have open.

    DELETING A PARENT DELETES ITS REPLIES. Cascade, not a tombstone, and the
    reasoning is written up in docs/api/social_service.md: this service has no
    soft-delete column on ANY table, and introducing one here would make
    `post_comments` deletable two ways with only one of them honoured by
    `list_comments`, `comment_count`, `reply_count`, the moderation queue and
    the author-name event consumer. That divergence - a flag some readers
    respect and others do not - is the shape of every bug this service has
    already shipped. The cost is real and is not hidden: deleting your own
    comment removes replies other people wrote.

    THE CHILDREN ARE DELETED EXPLICITLY, even though the FK says CASCADE.
    SQLite - the test engine - has foreign key enforcement OFF by default, so
    relying on the constraint alone would mean the suite proves orphans are
    fine while Postgres cascades. One statement, identical behaviour on both.
    The FK stays as the backstop for anything that deletes outside this
    function (a post cascade, a DBA).
    """
    comment = await db.get(PostComment, comment_id)
    if comment is None or comment.post_id != post_id:
        raise SocialError("comment not found")
    if comment.author_user_id != _principal_uuid(principal):
        raise SocialForbidden("not the author of this comment")
    # One level only, so a single non-recursive delete reaches every descendant.
    # A no-op when `comment` is itself a reply.
    await db.execute(sa_delete(PostComment).where(PostComment.parent_comment_id == comment_id))
    await db.delete(comment)
    await db.flush()


async def create_question(db: AsyncSession, principal: Principal, payload: QAQuestionCreate) -> SocialQuestion:
    _ensure_question_access(principal)
    question = SocialQuestion(
        author_user_id=_principal_uuid(principal),
        author_role=principal.role,
        question=payload.question.strip(),
        is_anonymous=payload.is_anonymous,
        moderation_status=ModerationStatus.PENDING.value,
    )
    db.add(question)
    await db.flush()
    await db.refresh(question)
    return question


async def list_questions(db: AsyncSession) -> list[SocialQuestion]:
    stmt = select(SocialQuestion).where(SocialQuestion.moderation_status != ModerationStatus.FLAGGED.value).order_by(SocialQuestion.created_at.desc())
    result = await db.scalars(stmt)
    return list(result.all())


async def answer_question(db: AsyncSession, principal: Principal, question_id: UUID, payload: QAAnswerCreate) -> SocialQuestion:
    _ensure_answer_access(principal)
    question = await db.get(SocialQuestion, question_id)
    if question is None:
        raise SocialError("question not found")
    question.answer = payload.answer.strip()
    question.answered_by_user_id = _principal_uuid(principal)
    question.answered_at = datetime.now(tz=UTC)
    question.moderation_status = ModerationStatus.APPROVED.value
    await db.flush()
    await db.refresh(question)
    return question


async def list_moderation_queue(db: AsyncSession, principal: Principal) -> list[dict[str, object]]:
    _ensure_moderation_access(principal)
    posts = await db.scalars(select(SocialPost).where(SocialPost.moderation_status.in_([ModerationStatus.PENDING.value, ModerationStatus.FLAGGED.value])))
    questions = await db.scalars(select(SocialQuestion).where(SocialQuestion.moderation_status.in_([ModerationStatus.PENDING.value, ModerationStatus.FLAGGED.value])))
    comments = await db.scalars(select(PostComment).where(PostComment.moderation_status.in_([ModerationStatus.PENDING.value, ModerationStatus.FLAGGED.value])))

    queue: list[dict[str, object]] = []
    for post in posts.all():
        queue.append({"item_type": "post", "item_id": post.id, "moderation_status": post.moderation_status, "title": post.title, "body": post.body})
    for question in questions.all():
        queue.append({"item_type": "question", "item_id": question.id, "moderation_status": question.moderation_status, "title": None, "body": question.question})
    for comment in comments.all():
        queue.append({"item_type": "comment", "item_id": comment.id, "moderation_status": comment.moderation_status, "title": None, "body": comment.body})
    return queue

async def list_comments(
    db: AsyncSession,
    post_id: UUID,
    limit: int | None = None,
    offset: int = 0,
) -> tuple[list[PostComment], int | None]:
    """Approved comments on a post, oldest first.

    ONLY APPROVED, matching the `comment_count` aggregate on the feed card. If
    this returned pending ones the list would contradict the number that led the
    user here, and a flagged comment would be published by the back door.

    The post itself is checked first: commenting on a nonexistent post already
    404s, and listing should not quietly return an empty array for one, which
    reads as "no comments yet" rather than "no such post".

    Oldest first, unlike the feed. A conversation reads in the order it
    happened; only the feed is newest-first.

    PAGED, offset-based, returning `(comments, next_offset)` exactly like
    `list_feed`. Note the interaction with the ordering: because this list is
    OLDEST first, a new comment lands at the END, so paging forward through a
    live thread is stable in a way the newest-first feed is not.

    TOP-LEVEL ONLY since 2026-08-08 - `parent_comment_id IS NULL`. Replies are
    fetched per parent, on demand, through `list_replies`, and are NOT inlined
    here. Inlining them would make a page of 20 mean an unbounded number of
    rows, would put the reply pagination inside an item of an already paginated
    list, and would download an entire argument nobody asked to read. Each row
    instead carries `reply_count`, which is all "View 3 replies" needs.

    THIS IS A CONTRACT CHANGE for any caller written before that date: a thread
    with 4 top-level comments and 6 replies used to return 10 items here and now
    returns 4. `comment_count` on the post still counts all 10 - see
    `_comment_count_column` for why those two numbers are allowed to differ.
    """
    page = _clamp_limit(limit)
    offset = max(0, int(offset))
    post = await db.get(SocialPost, post_id)
    if post is None or post.kind != PostKind.BLOG.value:
        raise SocialError("post not found")
    stmt = (
        select(PostComment, _reply_count_column().label("reply_count"))
        .where(PostComment.post_id == post_id)
        .where(PostComment.parent_comment_id.is_(None))
        .where(PostComment.moderation_status == ModerationStatus.APPROVED.value)
        .order_by(PostComment.created_at.asc())
        .offset(offset)
        .limit(page + 1)
    )
    rows = (await db.execute(stmt)).all()
    has_more = len(rows) > page
    return _attach_reply_counts(rows[:page]), (offset + page if has_more else None)


async def list_replies(
    db: AsyncSession,
    comment_id: UUID,
    limit: int | None = None,
    offset: int = 0,
) -> tuple[list[PostComment], int | None]:
    """Approved replies under one comment, oldest first, paginated.

    ON DEMAND, per parent. The top-level list returns a `reply_count` and
    nothing more; this is what the client calls when the reader taps
    "View 3 replies". Same `(rows, next_offset)` pair, same `limit`/`offset`
    bounds and the same oldest-first ordering as `list_comments`, so the client
    reuses one pager and one mapper.

    APPROVED ONLY, matching `reply_count` exactly. The count and this list are
    computed from the same predicate, so "View 3 replies" cannot open onto two.

    A FLAGGED PARENT STILL SERVES ITS REPLIES. The parent must EXIST (404
    otherwise), but its own moderation status is not consulted, and that is a
    considered choice rather than an oversight:

      - A report against a parent is not a report against the replies. Those are
        other people's words, unreported, and hiding them punishes them for a
        stranger's action - especially given one report is enough to flag
        anything in this service, with no threshold and no un-flag route.
      - Nothing flagged is disclosed by doing so. This route returns the
        CHILDREN; the flagged parent's own body is never in the response, and it
        is already gone from `list_comments` and from `comment_count`.

    The honest consequence, stated rather than buried: a flagged parent
    disappears from the top-level list, so its replies are only reachable by a
    caller that already holds the parent id. The thread is not silently
    rewritten to look shorter than it is - it is removed whole, and the count
    the client last saw is the count this route still returns.

    IF `comment_id` IS ITSELF A REPLY, this returns the replies of ITS parent -
    the same thread it belongs to. That mirrors the write rule in
    `create_comment` exactly: an id at depth 2 resolves to the depth-1 row above
    it, on read as on write. The alternative, returning an empty list, would be
    a wrong answer that looks exactly like a right one ("this reply has no
    replies") - the class of silent default that has already cost this service
    two shipped bugs.
    """
    page = _clamp_limit(limit)
    offset = max(0, int(offset))
    parent = await db.get(PostComment, comment_id)
    if parent is None:
        raise SocialError("comment not found")
    # Resolve to the top-level row, so a reply id and its parent's id return the
    # same thread.
    parent_id = parent.parent_comment_id or parent.id
    stmt = (
        select(PostComment, _reply_count_column().label("reply_count"))
        .where(PostComment.parent_comment_id == parent_id)
        .where(PostComment.moderation_status == ModerationStatus.APPROVED.value)
        .order_by(PostComment.created_at.asc())
        .offset(offset)
        .limit(page + 1)
    )
    rows = (await db.execute(stmt)).all()
    has_more = len(rows) > page
    # `reply_count` is selected for every reply and is always 0 by the one-level
    # rule. Computed rather than hardcoded so that if the rule were ever
    # loosened, this number would tell the truth instead of a stale constant.
    return _attach_reply_counts(rows[:page]), (offset + page if has_more else None)
