"""Threaded comment replies on post_comments - EXACTLY two levels.

Adds three nullable columns and one self-referential foreign key:

    parent_comment_id  -> post_comments.id, ON DELETE CASCADE, indexed
    reply_to_user_id   -> the author of the comment being answered, indexed
    reply_to_name      -> that author's display-name SNAPSHOT, for "@name"

WHY NULLABLE, WHY NO BACKFILL. Every existing comment is top-level by
definition, and `parent_comment_id IS NULL` is exactly how the read path spells
that. There is nothing to backfill: a NULL here is not "unknown", it is the
answer.

WHY NO reply_count COLUMN. `reply_count` is a correlated subquery, matching how
`like_count` and `comment_count` are already computed in `list_feed`. A stored
counter needs a writer on every insert, delete, report and un-report path, and a
counter with a missing writer is a documented failure mode in this repo - it
drifts silently and reads as a plausible number. There is no counter column
anywhere in this service and this migration does not add the first one.

ON DELETE CASCADE, not a tombstone. Justified in docs/api/social_service.md:
this service has no soft-delete column on any table, and adding one here would
make post_comments deletable two ways with only one of them honoured by
`list_comments`, `comment_count`, `reply_count`, the moderation queue and the
author-name event consumer. The cost - deleting a parent removes replies other
people wrote - is real and is documented rather than hidden.

TIMESTAMPS. No table is created here, so no `created_at`/`updated_at` column is
introduced. The three columns added are all nullable with no default. The
existing `post_comments.created_at`/`updated_at` defaults are nonetheless
RE-ASSERTED below, idempotently: omitting `server_default` on these two is the
single most repeated defect in this repo (see 20260807_ts and 20260807_bkmrep),
it has 500d `POST /posts/{id}/comments` in production before, and no test can
catch it because the suite builds its schema from model metadata, which has the
default. Re-asserting costs one statement and closes the door on this table.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260808_replies"
down_revision = "20260807_bkmrep"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "post_comments",
        sa.Column("parent_comment_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "post_comments",
        sa.Column("reply_to_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "post_comments",
        sa.Column("reply_to_name", sa.String(length=255), nullable=True),
    )

    op.create_foreign_key(
        "fk_post_comments_parent_comment_id",
        "post_comments",
        "post_comments",
        ["parent_comment_id"],
        ["id"],
        ondelete="CASCADE",
    )
    # Indexed because EVERY read of a thread filters on it: the top-level list
    # is `parent_comment_id IS NULL`, the replies route is
    # `parent_comment_id = :id`, and `reply_count` is a correlated subquery over
    # the same predicate once per row returned.
    op.create_index(op.f("ix_post_comments_parent_comment_id"), "post_comments", ["parent_comment_id"], unique=False)
    # Indexed for the `user.profile.updated` consumer, which rewrites
    # `reply_to_name` for a renamed user across every reply that names them.
    op.create_index(op.f("ix_post_comments_reply_to_user_id"), "post_comments", ["reply_to_user_id"], unique=False)

    # Belt and braces on the defect this repo keeps shipping - see the module
    # docstring. Idempotent: setting a default that is already set is a no-op.
    for column in ("created_at", "updated_at"):
        op.execute(f"UPDATE post_comments SET {column} = now() WHERE {column} IS NULL")  # noqa: S608
        op.alter_column(
            "post_comments",
            column,
            existing_type=sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            existing_nullable=False,
            nullable=False,
        )


def downgrade() -> None:
    # The timestamp defaults are deliberately NOT removed. They were not created
    # by this migration and dropping them would re-open the 500 that
    # 20260807_ts exists to close.
    op.drop_index(op.f("ix_post_comments_reply_to_user_id"), table_name="post_comments")
    op.drop_index(op.f("ix_post_comments_parent_comment_id"), table_name="post_comments")
    op.drop_constraint("fk_post_comments_parent_comment_id", "post_comments", type_="foreignkey")
    op.drop_column("post_comments", "reply_to_name")
    op.drop_column("post_comments", "reply_to_user_id")
    # Replies themselves are NOT deleted on downgrade. They lose the link that
    # made them replies and become top-level comments, which is lossy but
    # visible; silently deleting other people's writing to undo a schema change
    # is not a trade this service makes.
    op.drop_column("post_comments", "parent_comment_id")
