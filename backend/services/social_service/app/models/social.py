from __future__ import annotations

from enum import StrEnum
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base, TimestampMixin


class PostKind(StrEnum):
    BLOG = "blog"
    QA = "qa"


class ModerationStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    FLAGGED = "flagged"


class ReactionType(StrEnum):
    LIKE = "like"
    LOVE = "love"
    SUPPORT = "support"
    INSIGHTFUL = "insightful"


class SocialPost(Base, TimestampMixin):
    __tablename__ = "social_posts"

    kind: Mapped[str] = mapped_column(String(16), nullable=False, default=PostKind.BLOG, index=True)
    author_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    author_role: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    # Display-name SNAPSHOT, resolved from user_service at write time.
    #
    # Denormalised rather than joined because identity lives in another service
    # and there is no shared database. Resolving at READ time would mean an
    # N+1 across the network per feed page and would take Community down
    # whenever user_service blinked. Writes are rare; feeds are read constantly.
    #
    # Nullable on purpose: an anonymous post never gets one, and a lookup
    # failure must not block publishing a post.
    #
    # KNOWN STALENESS: a user who later changes their name keeps the old one on
    # existing posts. user_service publishes no profile-changed event yet; the
    # outbox machinery in shared/events is where that refresh belongs.
    author_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    excerpt: Mapped[str | None] = mapped_column(String(512), nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    moderation_status: Mapped[str] = mapped_column(String(32), nullable=False, default=ModerationStatus.PENDING, index=True)
    published_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def post_id(self):
        return self.id


class PostComment(Base, TimestampMixin):
    __tablename__ = "post_comments"

    post_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("social_posts.id", ondelete="CASCADE"), nullable=False, index=True)
    author_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    author_role: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    moderation_status: Mapped[str] = mapped_column(String(32), nullable=False, default=ModerationStatus.APPROVED, index=True)

    @property
    def comment_id(self):
        return self.id


class PostReaction(Base, TimestampMixin):
    __tablename__ = "post_reactions"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_post_reactions_post_user"),)

    post_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("social_posts.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    user_role: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    reaction_type: Mapped[str] = mapped_column(String(32), nullable=False, default=ReactionType.LIKE, index=True)

    @property
    def reaction_id(self):
        return self.id


class SocialQuestion(Base, TimestampMixin):
    __tablename__ = "social_questions"

    author_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    author_role: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    moderation_status: Mapped[str] = mapped_column(String(32), nullable=False, default=ModerationStatus.PENDING, index=True)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    answered_by_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    answered_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def question_id(self):
        return self.id