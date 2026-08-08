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
    # Same snapshot as SocialPost.author_name, and for the same reason: identity
    # lives in user_service, and resolving at read time would be an N+1 across
    # the network for every comment on a post.
    #
    # NOTE: a comment has no `is_anonymous`. Unlike posts and questions, comments
    # are always attributed, so there is no case where the name is withheld -
    # only where the lookup failed.
    author_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    moderation_status: Mapped[str] = mapped_column(String(32), nullable=False, default=ModerationStatus.APPROVED, index=True)

    # THREADING, added 2026-08-08. Exactly TWO levels, never three.
    #
    # NULL   -> this is a top-level comment.
    # set    -> this is a reply, and the value is ALWAYS a top-level comment id.
    #
    # The "always top-level" half is not enforceable by a column constraint, so
    # it is enforced in `create_comment`: replying to a reply re-points at that
    # reply's own parent rather than nesting deeper. See the service layer for
    # why the client is not where that invariant can live.
    #
    # Self-referential FK with ON DELETE CASCADE. `delete_comment` ALSO deletes
    # children explicitly, because SQLite (the test engine) has foreign keys off
    # by default and would otherwise leave orphans green in the suite and
    # cascading in production - a divergence, not a redundancy.
    parent_comment_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("post_comments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # WHO this reply is answering, for the client's "@name" prefix. Needed
    # because a reply to a reply is stored at the SAME depth as the comment it
    # answers, so the parent link alone cannot say which sibling was meant.
    #
    # `reply_to_name` is COPIED from the target row's stored `author_name` - it
    # is never re-resolved from user_service. That is the anonymity guard: a row
    # whose name is absent (anonymous by construction, or a failed lookup) must
    # not acquire one because somebody replied to it. Null in, null out.
    reply_to_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    reply_to_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

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


class PostBookmark(Base, TimestampMixin):
    """A private "save for later" on a post.

    Deliberately NOT a reaction with a different `reaction_type`. A reaction is
    public and feeds `like_count`; a bookmark is private to the viewer and must
    never appear in anyone else's counts. Sharing the table would have made that
    distinction a `WHERE` clause someone eventually forgets.

    Unique on (post_id, user_id) so the route can be idempotent in the database
    rather than in a read-then-write race.
    """

    __tablename__ = "post_bookmarks"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_post_bookmarks_post_user"),)

    post_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("social_posts.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)

    @property
    def bookmark_id(self):
        return self.id


class ContentReport(Base, TimestampMixin):
    """A user report against a post or a comment.

    This is the WRITER for `ModerationStatus.FLAGGED`, which the moderation
    queue has always read and nothing has ever set.

    Polymorphic by (target_type, target_id) rather than two nullable FKs. There
    is no referential integrity as a result - a report outlives the row it
    points at, because posts and comments hard-delete - which is deliberate: an
    audit trail that vanishes when the reported content does is not an audit
    trail.

    Unique on (reporter_user_id, target_type, target_id): one user, one report,
    per item. Re-reporting is idempotent rather than a 409.
    """

    __tablename__ = "content_reports"
    __table_args__ = (UniqueConstraint("reporter_user_id", "target_type", "target_id", name="uq_content_reports_reporter_target"),)

    reporter_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    # 'post' | 'comment'. Free text of a bounded width, consistent with
    # `kind`, `moderation_status` and `reaction_type` in this service - none of
    # which are database enums either.
    target_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    target_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    reason: Mapped[str] = mapped_column(String(64), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    @property
    def report_id(self):
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