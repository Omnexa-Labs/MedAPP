from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

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


async def create_post(db: AsyncSession, principal: Principal, payload: PostCreate) -> SocialPost:
    _ensure_creator_access(principal)
    now = datetime.now(tz=UTC)
    post = SocialPost(
        kind=PostKind.BLOG.value,
        author_user_id=_principal_uuid(principal),
        author_role=principal.role,
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
    stmt = (
        select(SocialPost)
        .where(SocialPost.kind == PostKind.BLOG.value)
        .where(SocialPost.moderation_status == ModerationStatus.APPROVED.value)
        .order_by(SocialPost.published_at.desc().nullslast(), SocialPost.created_at.desc())
    )
    result = await db.scalars(stmt)
    return list(result.all())


async def create_comment(db: AsyncSession, principal: Principal, post_id: UUID, payload: CommentCreate) -> PostComment:
    post = await db.get(SocialPost, post_id)
    if post is None or post.kind != PostKind.BLOG.value:
        raise SocialError("post not found")
    comment = PostComment(
        post_id=post_id,
        author_user_id=_principal_uuid(principal),
        author_role=principal.role,
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