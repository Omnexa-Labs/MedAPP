from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..deps import DbSession, get_current_principal
from ..schemas.social import CommentCreate, CommentOut, ModerationItemOut, PostCreate, PostList, PostOut, QAAnswer, QAAnswerCreate, QAOut, QAQuestionCreate, ReactionCreate, ReactionOut
from ..services import SocialError, answer_question, create_comment, create_post, create_question, create_reaction, list_feed, list_moderation_queue, list_questions

router = APIRouter(prefix="/v1/social", tags=["Social"])


@router.post("/posts", response_model=PostOut, status_code=status.HTTP_201_CREATED)
async def create_blog_post(payload: PostCreate, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    try:
        post = await create_post(db, principal, payload)
    except HTTPException:
        raise
    except SocialError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return PostOut.model_validate(
        {
            "post_id": post.id,
            "kind": post.kind,
            "author_user_id": post.author_user_id,
            "author_role": post.author_role,
            "title": post.title,
            "body": post.body,
            "excerpt": post.excerpt,
            "tags": post.tags,
            "is_anonymous": post.is_anonymous,
            "moderation_status": post.moderation_status,
            "published_at": post.published_at,
            "created_at": post.created_at,
            "updated_at": post.updated_at,
        }
    )


@router.get("/feed", response_model=PostList)
async def read_feed(db: AsyncSession = DbSession):
    posts = await list_feed(db)
    return PostList(items=[PostOut.model_validate(
        {
            "post_id": post.id,
            "kind": post.kind,
            "author_user_id": post.author_user_id,
            "author_role": post.author_role,
            "title": post.title,
            "body": post.body,
            "excerpt": post.excerpt,
            "tags": post.tags,
            "is_anonymous": post.is_anonymous,
            "moderation_status": post.moderation_status,
            "published_at": post.published_at,
            "created_at": post.created_at,
            "updated_at": post.updated_at,
            # `list_feed` attaches these as transient attributes on the ORM
            # instance. They MUST be listed here: this builds PostOut from an
            # explicit dict rather than from the object, so `from_attributes`
            # never runs and anything omitted silently falls back to the field
            # default - which for a count is 0, indistinguishable from a real
            # answer. That is exactly how the first version of this shipped
            # reporting zero likes on a post that had one.
            "like_count": getattr(post, "like_count", 0),
            "comment_count": getattr(post, "comment_count", 0),
        }
    ) for post in posts])


@router.post("/posts/{post_id}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
async def add_comment(post_id: UUID, payload: CommentCreate, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    try:
        comment = await create_comment(db, principal, post_id, payload)
    except SocialError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return CommentOut.model_validate(
        {
            "comment_id": comment.id,
            "post_id": comment.post_id,
            "author_user_id": comment.author_user_id,
            "author_role": comment.author_role,
            "body": comment.body,
            "moderation_status": comment.moderation_status,
            "created_at": comment.created_at,
            "updated_at": comment.updated_at,
        }
    )


@router.post("/posts/{post_id}/react", response_model=ReactionOut, status_code=status.HTTP_201_CREATED)
async def add_reaction(post_id: UUID, payload: ReactionCreate, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    try:
        reaction = await create_reaction(db, principal, post_id, payload)
    except SocialError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return ReactionOut.model_validate(
        {
            "reaction_id": reaction.id,
            "post_id": reaction.post_id,
            "user_id": reaction.user_id,
            "user_role": reaction.user_role,
            "reaction_type": reaction.reaction_type,
            "created_at": reaction.created_at,
            "updated_at": reaction.updated_at,
        }
    )


@router.post("/qa", response_model=QAOut, status_code=status.HTTP_201_CREATED)
async def ask_question(payload: QAQuestionCreate, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    try:
        question = await create_question(db, principal, payload)
    except SocialError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return QAOut.model_validate(
        {
            "question_id": question.id,
            "author_user_id": question.author_user_id,
            "author_role": question.author_role,
            "question": question.question,
            "is_anonymous": question.is_anonymous,
            "moderation_status": question.moderation_status,
            "answer": question.answer,
            "answered_by_user_id": question.answered_by_user_id,
            "answered_at": question.answered_at,
            "created_at": question.created_at,
            "updated_at": question.updated_at,
        }
    )


@router.get("/qa", response_model=list[QAOut])
async def read_questions(db: AsyncSession = DbSession):
    questions = await list_questions(db)
    return [
        QAOut.model_validate(
            {
                "question_id": question.id,
                "author_user_id": question.author_user_id,
                "author_role": question.author_role,
                "question": question.question,
                "is_anonymous": question.is_anonymous,
                "moderation_status": question.moderation_status,
                "answer": question.answer,
                "answered_by_user_id": question.answered_by_user_id,
                "answered_at": question.answered_at,
                "created_at": question.created_at,
                "updated_at": question.updated_at,
            }
        )
        for question in questions
    ]


@router.post("/qa/{question_id}/answer", response_model=QAAnswer)
async def answer(question_id: UUID, payload: QAAnswerCreate, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    try:
        question = await answer_question(db, principal, question_id, payload)
    except SocialError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return QAAnswer.model_validate(
        {
            "question_id": question.id,
            "answer": question.answer,
            "answered_by_user_id": question.answered_by_user_id,
            "answered_at": question.answered_at,
        }
    )


@router.get("/moderation", response_model=list[ModerationItemOut])
async def moderation_queue(db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    try:
        items = await list_moderation_queue(db, principal)
    except HTTPException:
        raise
    return [ModerationItemOut.model_validate(item) for item in items]