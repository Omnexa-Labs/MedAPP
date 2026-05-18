"""initial schema for social_service

Revision ID: 20260518_0001
Revises:
Create Date: 2026-05-18 00:01:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260518_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "social_posts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="blog"),
        sa.Column("author_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_role", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("excerpt", sa.String(length=512), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("is_anonymous", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("moderation_status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f("ix_social_posts_kind"), "social_posts", ["kind"], unique=False)
    op.create_index(op.f("ix_social_posts_author_user_id"), "social_posts", ["author_user_id"], unique=False)
    op.create_index(op.f("ix_social_posts_author_role"), "social_posts", ["author_role"], unique=False)
    op.create_index(op.f("ix_social_posts_is_anonymous"), "social_posts", ["is_anonymous"], unique=False)
    op.create_index(op.f("ix_social_posts_moderation_status"), "social_posts", ["moderation_status"], unique=False)

    op.create_table(
        "post_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("post_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_role", sa.String(length=32), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("moderation_status", sa.String(length=32), nullable=False, server_default="approved"),
        sa.ForeignKeyConstraint(["post_id"], ["social_posts.id"], ondelete="CASCADE"),
    )
    op.create_index(op.f("ix_post_comments_post_id"), "post_comments", ["post_id"], unique=False)
    op.create_index(op.f("ix_post_comments_author_user_id"), "post_comments", ["author_user_id"], unique=False)
    op.create_index(op.f("ix_post_comments_author_role"), "post_comments", ["author_role"], unique=False)
    op.create_index(op.f("ix_post_comments_moderation_status"), "post_comments", ["moderation_status"], unique=False)

    op.create_table(
        "post_reactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("post_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_role", sa.String(length=32), nullable=False),
        sa.Column("reaction_type", sa.String(length=32), nullable=False, server_default="like"),
        sa.ForeignKeyConstraint(["post_id"], ["social_posts.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("post_id", "user_id", name="uq_post_reactions_post_user"),
    )
    op.create_index(op.f("ix_post_reactions_post_id"), "post_reactions", ["post_id"], unique=False)
    op.create_index(op.f("ix_post_reactions_user_id"), "post_reactions", ["user_id"], unique=False)
    op.create_index(op.f("ix_post_reactions_user_role"), "post_reactions", ["user_role"], unique=False)
    op.create_index(op.f("ix_post_reactions_reaction_type"), "post_reactions", ["reaction_type"], unique=False)

    op.create_table(
        "social_questions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("author_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_role", sa.String(length=32), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("is_anonymous", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("moderation_status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("answered_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f("ix_social_questions_author_user_id"), "social_questions", ["author_user_id"], unique=False)
    op.create_index(op.f("ix_social_questions_author_role"), "social_questions", ["author_role"], unique=False)
    op.create_index(op.f("ix_social_questions_is_anonymous"), "social_questions", ["is_anonymous"], unique=False)
    op.create_index(op.f("ix_social_questions_moderation_status"), "social_questions", ["moderation_status"], unique=False)
    op.create_index(op.f("ix_social_questions_answered_by_user_id"), "social_questions", ["answered_by_user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_social_questions_answered_by_user_id"), table_name="social_questions")
    op.drop_index(op.f("ix_social_questions_moderation_status"), table_name="social_questions")
    op.drop_index(op.f("ix_social_questions_is_anonymous"), table_name="social_questions")
    op.drop_index(op.f("ix_social_questions_author_role"), table_name="social_questions")
    op.drop_index(op.f("ix_social_questions_author_user_id"), table_name="social_questions")
    op.drop_table("social_questions")

    op.drop_index(op.f("ix_post_reactions_reaction_type"), table_name="post_reactions")
    op.drop_index(op.f("ix_post_reactions_user_role"), table_name="post_reactions")
    op.drop_index(op.f("ix_post_reactions_user_id"), table_name="post_reactions")
    op.drop_index(op.f("ix_post_reactions_post_id"), table_name="post_reactions")
    op.drop_table("post_reactions")

    op.drop_index(op.f("ix_post_comments_moderation_status"), table_name="post_comments")
    op.drop_index(op.f("ix_post_comments_author_role"), table_name="post_comments")
    op.drop_index(op.f("ix_post_comments_author_user_id"), table_name="post_comments")
    op.drop_index(op.f("ix_post_comments_post_id"), table_name="post_comments")
    op.drop_table("post_comments")

    op.drop_index(op.f("ix_social_posts_moderation_status"), table_name="social_posts")
    op.drop_index(op.f("ix_social_posts_is_anonymous"), table_name="social_posts")
    op.drop_index(op.f("ix_social_posts_author_role"), table_name="social_posts")
    op.drop_index(op.f("ix_social_posts_author_user_id"), table_name="social_posts")
    op.drop_index(op.f("ix_social_posts_kind"), table_name="social_posts")
    op.drop_table("social_posts")