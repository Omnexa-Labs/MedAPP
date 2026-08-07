"""Add author_name snapshot to social_posts.

Denormalised display name, resolved from user_service at write time. See the
column comment on `SocialPost.author_name` for why this is a snapshot rather
than a read-time join: identity lives in another service with no shared
database, so joining would mean an N+1 across the network on every feed paint
and would couple Community's availability to user_service.

Nullable, and no backfill. An anonymous post must never carry one, and existing
posts pre-date the lookup - the API returns null and the client falls back to
initials, which is the agreed v1 behaviour.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260807_author"
down_revision = "20260807_ts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("social_posts", sa.Column("author_name", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("social_posts", "author_name")
