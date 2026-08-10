"""Add author_name snapshot to post_comments.

Mirrors social_posts.author_name. Identity lives in user_service, so a
read-time join would be an N+1 across the network for every comment on a post.

Nullable, no backfill: existing comments pre-date the lookup and the client
falls back to initials, which is the agreed v1 behaviour.

Unlike posts, a comment has no `is_anonymous` - comments are always attributed,
so null here only ever means the write-time lookup failed.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260807_cauthor"
down_revision = "20260807_author"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("post_comments", sa.Column("author_name", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("post_comments", "author_name")
