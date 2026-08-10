"""Publish the posts that auto-publish left stranded.

DATA MIGRATION, no schema change.

`create_post` wrote `moderation_status='pending'` with `published_at=NULL`, and
`list_feed` selects `moderation_status='approved'` - while NO route in this
service ever set a post to approved. Every post ever created through the API was
therefore invisible forever, in a service whose only read surface is the feed.
Six of the seven rows in the live database were stranded this way. The bug was
not visible in tests because `test_feed_returns_only_approved_posts` flips the
status by hand in the test body, which is precisely the step no caller can make.

`create_post` now publishes on write. This migration brings the rows already in
the table to the state they would have had under that rule.

`published_at = created_at`, NOT `now()`. These posts were written when they
were written; stamping them all with the migration timestamp would bunch them at
the top of a feed ordered by `published_at` and rewrite their history to say
they were published the day someone fixed a bug.

FLAGGED ROWS ARE NOT TOUCHED. The WHERE clause is `status = 'pending'`, so
anything a moderator has already pulled down stays down. This migration
publishes what was stranded; it does not overturn a moderation decision.

Scoped to `kind='blog'` because that is what the feed reads. Questions have
their own status column and their own route (`answer_question` approves them),
and are deliberately left alone.
"""

from __future__ import annotations

from alembic import op

revision = "20260807_publish"
down_revision = "20260807_cauthor"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE social_posts
           SET moderation_status = 'approved',
               published_at = created_at
         WHERE moderation_status = 'pending'
           AND published_at IS NULL
           AND kind = 'blog'
        """
    )


def downgrade() -> None:
    # NOT REVERSIBLE, on purpose, and this is a deliberate no-op rather than a
    # raise. There is no column recording which rows this migration touched, so
    # the only available "undo" is to un-publish every approved post - which
    # would take down posts that were legitimately published afterwards. Losing
    # the fix on downgrade is better than hiding real content.
    pass
