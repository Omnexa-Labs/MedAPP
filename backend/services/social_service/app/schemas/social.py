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
    # NULL when `is_anonymous` - see `_anonymised_author_id` in routers/social.py.
    # The name being absent is not enough: the id is stable and appears on the
    # same user's attributed posts and on every comment they write, so handing
    # it over lets two ordinary responses undo the anonymity.
    author_user_id: UUID | None = None
    # Ownership, answered by the SERVER instead of by the client comparing ids.
    # Withholding `author_user_id` would otherwise take the Delete affordance
    # away from the author of an anonymous post - the one person entitled to it.
    owned_by_me: bool = False
    author_role: str
    # Resolved at write time from user_service. None for an anonymous post, and
    # None when the lookup failed - the client must handle both and fall back to
    # initials or a neutral label rather than printing a UUID.
    author_name: str | None = None
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
    # PER-VIEWER flags, added 2026-08-07. Everything above this line is the same
    # for every caller; these two are not, and that is the trap. They are
    # computed from the CALLER's principal, so any cache keyed only on post id -
    # an HTTP cache, a CDN, a shared react-query key - will serve one user's
    # like state to another.
    #
    # False for an unauthenticated caller: the feed is readable without a token,
    # and "nobody is signed in" is honestly represented as "not liked" rather
    # than as an error.
    liked_by_me: bool = False
    bookmarked_by_me: bool = False


class PostList(BaseModel):
    items: list[PostOut] = Field(default_factory=list)
    # Offset to pass back for the next page, or None when this was the last one.
    #
    # The SERVER decides there is a next page, by asking for one row more than
    # `limit` and discarding it. A client that instead infers "full page means
    # more" pages forever on a total that is an exact multiple of the limit.
    next_offset: int | None = None


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    # Optional. Absent or null -> a top-level comment.
    #
    # This may name a top-level comment OR another reply. Naming a reply does
    # NOT nest deeper: the service re-points the new comment at that reply's own
    # parent, so a thread is never more than two levels. The client cannot opt
    # out of that, and must not try to compute the "real" parent itself - see
    # `create_comment` in the service layer.
    parent_comment_id: UUID | None = None


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    comment_id: UUID
    post_id: UUID
    author_user_id: UUID
    author_role: str
    # Resolved at write time. None only when the lookup failed - a comment is
    # always attributed, so there is no anonymous case here.
    author_name: str | None = None
    body: str
    moderation_status: str
    created_at: datetime
    updated_at: datetime
    # THREADING, added 2026-08-08.
    #
    # None -> top-level. Set -> a reply, and the value is ALWAYS a top-level
    # comment id; the API guarantees it, so a client can render a thread with a
    # flat two-level model and never needs a recursive component.
    parent_comment_id: UUID | None = None
    # Who this reply answers, for the "@name" prefix. Both are None on a
    # top-level comment.
    #
    # `reply_to_name` is a SNAPSHOT COPIED from the target comment's own stored
    # name, never re-resolved. It is None whenever the target's name is None -
    # anonymous by construction, or a failed lookup - and the client MUST render
    # no prefix in that case rather than substituting `reply_to_user_id`. A UUID
    # in an "@" prefix is worse than no prefix, and against content whose author
    # chose not to be named it is a deanonymisation.
    reply_to_user_id: UUID | None = None
    reply_to_name: str | None = None
    # Approved replies under this comment, so the client can render
    # "View 3 replies" without fetching them.
    #
    # Computed as a correlated subquery, like `like_count`/`comment_count` on
    # PostOut - there is no stored counter column in this service. Always 0 on a
    # reply, which is not a default standing in for an unknown: the one-level
    # rule means a reply can never have children.
    #
    # EXCLUDES flagged replies, matching what `GET /comments/{id}/replies`
    # returns, so the number and the list can never disagree.
    reply_count: int = 0


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
    # NULL when `is_anonymous`, which for a QUESTION defaults to TRUE. These are
    # the most sensitive rows in the service - people ask about sexual health,
    # mental health and substance use here - so the id must not survive the
    # response. See `_anonymised_author_id` in routers/social.py.
    author_user_id: UUID | None = None
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


class CommentList(BaseModel):
    """`{items}`, matching PostList.

    The QA route returns a bare array and this does not. That asymmetry already
    exists in this service and in inbox_service; it is documented in
    docs/api/social_service.md rather than "fixed" here, because changing an
    envelope a client already parses is a breaking change dressed as tidying.
    """

    items: list[CommentOut] = Field(default_factory=list)
    # Same contract as PostList.next_offset - None on the last page.
    next_offset: int | None = None


class BookmarkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    bookmark_id: UUID
    post_id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime


class ReportCreate(BaseModel):
    reason: str = Field(min_length=1, max_length=64)
    note: str | None = Field(default=None, max_length=4000)


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    report_id: UUID
    reporter_user_id: UUID
    target_type: str
    target_id: UUID
    reason: str
    note: str | None = None
    # The target's status AFTER the report - 'flagged'. Returned so the client
    # can stop rendering the item without a refetch, and so the effect of
    # reporting is visible in the response rather than only in the feed.
    target_moderation_status: str
    created_at: datetime
    updated_at: datetime
