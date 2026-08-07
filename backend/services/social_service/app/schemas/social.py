from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PostCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    body: str = Field(min_length=1, max_length=10_000)
    excerpt: str | None = Field(default=None, max_length=512)
    tags: list[str] = Field(default_factory=list)
    is_anonymous: bool = False


class PostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    post_id: UUID
    kind: str
    author_user_id: UUID
    author_role: str
    title: str
    body: str
    excerpt: str | None = None
    tags: list[str]
    is_anonymous: bool
    moderation_status: str
    published_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    # Engagement counts, added 2026-08-07.
    #
    # Reactions and comments live in THIS service (PostReaction, PostComment),
    # so these are a local aggregate, not an integration. The mobile feed card
    # needs them and previously had no way to get them: reactions and comments
    # were write-only, with no aggregate and no list route, so a live feed would
    # have rendered every post with zero engagement.
    #
    # Defaulted so any caller that builds a PostOut without the aggregate query
    # (create_post, the moderation queue) still validates.
    like_count: int = 0
    comment_count: int = 0


class PostList(BaseModel):
    items: list[PostOut] = Field(default_factory=list)


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    comment_id: UUID
    post_id: UUID
    author_user_id: UUID
    author_role: str
    body: str
    moderation_status: str
    created_at: datetime
    updated_at: datetime


class ReactionCreate(BaseModel):
    reaction_type: str = Field(default="like", max_length=32)


class ReactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    reaction_id: UUID
    post_id: UUID
    user_id: UUID
    user_role: str
    reaction_type: str
    created_at: datetime
    updated_at: datetime


class QAQuestionCreate(BaseModel):
    question: str = Field(min_length=1, max_length=10_000)
    is_anonymous: bool = True


class QAAnswerCreate(BaseModel):
    answer: str = Field(min_length=1, max_length=10_000)


class QAAnswer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    question_id: UUID
    answer: str | None = None
    answered_by_user_id: UUID | None = None
    answered_at: datetime | None = None


class QAOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    question_id: UUID
    author_user_id: UUID
    author_role: str
    question: str
    is_anonymous: bool
    moderation_status: str
    answer: str | None = None
    answered_by_user_id: UUID | None = None
    answered_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ModerationItemOut(BaseModel):
    item_type: str
    item_id: UUID
    moderation_status: str
    title: str | None = None
    body: str | None = None
