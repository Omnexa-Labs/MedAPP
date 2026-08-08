"""Add post_bookmarks and content_reports.

`post_bookmarks` - a private save-for-later. Separate from `post_reactions`
rather than a new `reaction_type`, because a reaction is public and feeds
`like_count` while a bookmark must never appear in anyone else's counts;
sharing the table would make that a WHERE clause somebody eventually forgets.

`content_reports` - the first and only WRITER of `moderation_status='flagged'`,
which the moderation queue has read since the initial schema while nothing ever
set it. Polymorphic by (target_type, target_id) rather than two nullable FKs,
and with NO foreign key: posts and comments hard-delete, and a report that
vanishes with the content it reported is not an audit trail.

`created_at`/`updated_at` CARRY `server_default=now()`. This is the defect this
repo has now shipped three times (see 20260807_ts): `shared.db.TimestampMixin`
declares the default in model metadata, but a HAND-WRITTEN migration never
consults metadata, so the live column reaches production NOT NULL with no
DEFAULT. The ORM emits neither value on INSERT because it expects the server to
supply them, and the first write 500s with NotNullViolationError. No test
catches it - the suite builds its schema from model metadata, which has the
default. Any new table in this service must spell these two out here.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260807_bkmrep"
down_revision = "20260807_publish"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "post_bookmarks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        # server_default is LOAD-BEARING - see the module docstring.
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("post_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["post_id"], ["social_posts.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("post_id", "user_id", name="uq_post_bookmarks_post_user"),
    )
    op.create_index(op.f("ix_post_bookmarks_post_id"), "post_bookmarks", ["post_id"], unique=False)
    op.create_index(op.f("ix_post_bookmarks_user_id"), "post_bookmarks", ["user_id"], unique=False)

    op.create_table(
        "content_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("reporter_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target_type", sa.String(length=16), nullable=False),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reason", sa.String(length=64), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        # No FK on target_id: it points at either social_posts or post_comments,
        # and must survive the hard delete of whichever it named.
        sa.UniqueConstraint("reporter_user_id", "target_type", "target_id", name="uq_content_reports_reporter_target"),
    )
    op.create_index(op.f("ix_content_reports_reporter_user_id"), "content_reports", ["reporter_user_id"], unique=False)
    op.create_index(op.f("ix_content_reports_target_type"), "content_reports", ["target_type"], unique=False)
    op.create_index(op.f("ix_content_reports_target_id"), "content_reports", ["target_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_content_reports_target_id"), table_name="content_reports")
    op.drop_index(op.f("ix_content_reports_target_type"), table_name="content_reports")
    op.drop_index(op.f("ix_content_reports_reporter_user_id"), table_name="content_reports")
    op.drop_table("content_reports")

    op.drop_index(op.f("ix_post_bookmarks_user_id"), table_name="post_bookmarks")
    op.drop_index(op.f("ix_post_bookmarks_post_id"), table_name="post_bookmarks")
    op.drop_table("post_bookmarks")
