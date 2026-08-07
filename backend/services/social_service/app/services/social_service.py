from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from .identity import resolve_display_name
from ..models import ModerationStatus, PostComment, PostReaction, PostKind, SocialPost, SocialQuestion
from ..schemas.social import CommentCreate, PostCreate, QAAnswerCreate, QAQuestionCreate, ReactionCreate


class SocialError(ValueError):
    pass


def _principal_uuid(principal: Principal) -> UUID:
    try:
        return UUID(principal.subject)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid principal subject") from exc


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
        moderation_status=ModerationStatus.PENDING.value,
        published_at=None,
        created_at=now,
        updated_at=now,
    )
    db.add(post)
    await db.flush()
    await db.refresh(post)
    return post


async def list_feed(db: AsyncSession) -> list[SocialPost]:
    """The public blog feed, with engagement counts attached.

    COUNTS ARE CORRELATED SUBQUERIES, not a join with GROUP BY, and not a
    per-post query. A join against two child tables would multiply rows
    (a post with 3 likes and 2 comments yields 6) and force a DISTINCT; a
    per-post count is the N+1 this method exists to avoid. Two scalar
    subqueries keep it a single round trip and one row per post.

    Only APPROVED comments are counted. This is patient-written health content
    and the feed card is a public surface: a pending or flagged comment must not
    inflate a number that implies it was published. Reactions have no moderation
    state, so all of them count.

    The counts are attached as plain attributes on the ORM instance rather than
    mapped columns. `PostOut` sets `from_attributes=True`, so `model_validate`
    picks them up, and nothing is persisted or invalidated by doing so.
    """
    like_count = (
        select(func.count(PostReaction.id))
        .where(PostReaction.post_id == SocialPost.id)
        .correlate(SocialPost)
        .scalar_subquery()
    )
    comment_count = (
        select(func.count(PostComment.id))
        .where(PostComment.post_id == SocialPost.id)
        .where(PostComment.moderation_status == ModerationStatus.APPROVED.value)
        .correlate(SocialPost)
        .scalar_subquery()
    )

    stmt = (
        select(SocialPost, like_count.label("like_count"), comment_count.label("comment_count"))
        .where(SocialPost.kind == PostKind.BLOG.value)
        .where(SocialPost.moderation_status == ModerationStatus.APPROVED.value)
        .order_by(SocialPost.published_at.desc().nullslast(), SocialPost.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()

    posts: list[SocialPost] = []
    for post, likes, comments in rows:
        post.like_count = int(likes or 0)
        post.comment_count = int(comments or 0)
        posts.append(post)
    return posts


async def create_comment(db: AsyncSession, principal: Principal, post_id: UUID, payload: CommentCreate, authorization: str | None = None) -> PostComment:
    post = await db.get(SocialPost, post_id)
    if post is None or post.kind != PostKind.BLOG.value:
        raise SocialError("post not found")
    comment = PostComment(
        post_id=post_id,
        author_user_id=_principal_uuid(principal),
        author_role=principal.role,
        # Non-fatal: a failed lookup leaves the name null rather than losing
        # what someone wrote. See services/identity.py.
        author_name=await resolve_display_name(str(_principal_uuid(principal)), authorization),
        body=payload.body.strip(),
        moderation_status=ModerationStatus.APPROVED.value,
    )
    db.add(comment)
    await db.flush()
    await db.refresh(comment)
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

async def list_comments(db: AsyncSession, post_id: UUID) -> list[PostComment]:
    """Approved comments on a post, oldest first.

    ONLY APPROVED, matching the `comment_count` aggregate on the feed card. If
    this returned pending ones the list would contradict the number that led the
    user here, and a flagged comment would be published by the back door.

    The post itself is checked first: commenting on a nonexistent post already
    404s, and listing should not quietly return an empty array for one, which
    reads as "no comments yet" rather than "no such post".

    Oldest first, unlike the feed. A conversation reads in the order it
    happened; only the feed is newest-first.

    NO PAGINATION, consistent with the rest of this service. Fine while a post
    has tens of comments; revisit before it has thousands.
    """
    post = await db.get(SocialPost, post_id)
    if post is None or post.kind != PostKind.BLOG.value:
        raise SocialError("post not found")
    stmt = (
        select(PostComment)
        .where(PostComment.post_id == post_id)
        .where(PostComment.moderation_status == ModerationStatus.APPROVED.value)
        .order_by(PostComment.created_at.asc())
    )
    return list((await db.scalars(stmt)).all())
