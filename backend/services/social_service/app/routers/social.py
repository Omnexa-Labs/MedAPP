from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status, Header
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..deps import DbSession, get_current_principal, get_optional_principal
from ..schemas.social import BookmarkOut, CommentCreate, CommentList, CommentOut, ModerationItemOut, PostCreate, PostList, PostOut, QAAnswer, QAAnswerCreate, QAOut, QAQuestionCreate, ReactionCreate, ReactionOut, ReportCreate, ReportOut
from ..services import SocialError, SocialForbidden, answer_question, create_bookmark, create_comment, create_post, create_question, create_reaction, create_report, delete_bookmark, delete_comment, delete_post, delete_reaction, get_post, list_bookmarks, list_comments, list_feed, list_moderation_queue, list_questions, list_replies

router = APIRouter(prefix="/v1/social", tags=["Social"])

# Paging bounds, applied by FastAPI so a bad value is a 422 rather than a
# clamped surprise. The service clamps as well, for callers that reach it
# directly (tests, the event consumer, anything future).
LimitQuery = Query(default=20, ge=1, le=100, description="Page size, max 100.")
OffsetQuery = Query(default=0, ge=0, description="Rows to skip. See `next_offset` on the response.")


def _anonymised_author_id(row) -> UUID | None:
    """The author id, or None when the row was published anonymously.

    WITHHOLDING THE NAME IS NOT ENOUGH. `author_name` is genuinely absent on an
    anonymous row, so there is no name to leak - but `author_user_id` is a
    STABLE identifier for the same person, and it is returned in full on their
    attributed posts and on every comment they write, where the name IS present.
    So an anonymous post plus any one attributed row from the same author, joined
    on this id, names them. Two ordinary reads and a join, no privileged access.

    That matters more here than it would elsewhere: `SocialQuestion.is_anonymous`
    defaults to TRUE, because this is where a patient asks about sexual health,
    mental health or substance use. A patient who chose "post anonymously" was
    given a promise, and shipping an id that breaks it is worse than not offering
    anonymity at all - they acted on a guarantee we did not keep.

    Moderation is unaffected: `list_moderation_queue` reads the ORM rows, not
    this shape, so a moderator can still act on an anonymous item.
    """
    return None if row.is_anonymous else row.author_user_id


def _qa_out(question) -> QAOut:
    """The ONE place a `QAOut` is built - same rule as `_post_out` below.

    Two routes returned this shape from two hand-written dicts. That is the
    duplication `_post_out` exists to prevent, and it is how the anonymity leak
    survived in both copies at once.
    """
    return QAOut.model_validate(
        {
            "question_id": question.id,
            "author_user_id": _anonymised_author_id(question),
            "author_role": question.author_role,
            "question": question.question,
            "is_anonymous": question.is_anonymous,
            "moderation_status": question.moderation_status,
            "answer": question.answer,
            "answered_by_user_id": question.answered_by_user_id,
            "answered_at": question.answered_at,
            "created_at": question.created_at,
            "updated_at": question.updated_at,
        }
    )


def _post_out(post) -> PostOut:
    """The ONE place a `PostOut` is built from a post row.

    THIS FUNCTION EXISTS BECAUSE OF A SHIPPED BUG. `PostOut` is built from an
    explicit dict, so `from_attributes` never runs and any field left out of the
    dict silently takes its pydantic default. For `like_count` that default is
    `0` - indistinguishable from a real answer - and that is exactly how the
    feed once shipped reporting zero likes on a post that had one. Nothing
    errored; the endpoint returned 200 with a plausible payload.

    Four routes now return this shape (feed, single post, create, bookmarks).
    Four copies of the dict is four chances to omit a field, so there is one
    copy. ANY field added to `PostOut` must be added HERE, and nowhere else.

    The engagement and per-viewer values are attached by the service layer as
    transient attributes; `getattr` with a default covers `create_post`, which
    returns a row that has no aggregates because a new post trivially has none.
    """
    return PostOut.model_validate(
        {
            "post_id": post.id,
            "kind": post.kind,
            "author_user_id": _anonymised_author_id(post),
            # Defaults False for `create_post`, which returns a row with no
            # per-viewer columns attached - and is corrected on the next read.
            # False is the safe direction to be wrong in: it hides a Delete the
            # author is entitled to, rather than offering one they are not.
            "owned_by_me": getattr(post, "owned_by_me", False),
            "author_role": post.author_role,
            # Null for an anonymous post BY CONSTRUCTION - the name was never
            # written to the row. Never substitute `author_user_id` here.
            "author_name": post.author_name,
            "title": post.title,
            "body": post.body,
            "excerpt": post.excerpt,
            "tags": post.tags,
            "is_anonymous": post.is_anonymous,
            "moderation_status": post.moderation_status,
            "published_at": post.published_at,
            "created_at": post.created_at,
            "updated_at": post.updated_at,
            "like_count": getattr(post, "like_count", 0),
            "comment_count": getattr(post, "comment_count", 0),
            "liked_by_me": getattr(post, "liked_by_me", False),
            "bookmarked_by_me": getattr(post, "bookmarked_by_me", False),
        }
    )


def _comment_out(comment) -> CommentOut:
    """Single builder for `CommentOut`, for the same reason as `_post_out`.

    ANY field added to `CommentOut` must be added HERE. `model_validate` on an
    explicit dict never runs `from_attributes`, so an omitted field silently
    takes its pydantic default - and for `reply_count` that default is `0`,
    which is indistinguishable from a real answer. That exact mistake shipped a
    feed reporting zero likes on a post that had one.
    """
    return CommentOut.model_validate(
        {
            "comment_id": comment.id,
            "post_id": comment.post_id,
            "author_user_id": comment.author_user_id,
            "author_role": comment.author_role,
            "author_name": comment.author_name,
            "body": comment.body,
            "moderation_status": comment.moderation_status,
            "created_at": comment.created_at,
            "updated_at": comment.updated_at,
            # None on a top-level comment; always a TOP-LEVEL id on a reply.
            "parent_comment_id": comment.parent_comment_id,
            # Never substitute `reply_to_user_id` for a null `reply_to_name` -
            # see the schema. A null means "not to be named", either because the
            # target is anonymous or because the lookup failed.
            "reply_to_user_id": comment.reply_to_user_id,
            "reply_to_name": comment.reply_to_name,
            # Attached by the service layer as a transient attribute. The
            # `getattr` covers `create_comment`, which returns a row that
            # trivially has no replies yet.
            "reply_count": getattr(comment, "reply_count", 0),
        }
    )


@router.post("/posts", response_model=PostOut, status_code=status.HTTP_201_CREATED)
async def create_blog_post(
    payload: PostCreate,
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
    # Forwarded to user_service so the name lookup runs AS THE AUTHOR rather
    # than under a service identity this service does not have.
    authorization: str | None = Header(default=None),
):
    try:
        post = await create_post(db, principal, payload, authorization)
    except HTTPException:
        raise
    except SocialError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return _post_out(post)


@router.get("/feed", response_model=PostList)
async def read_feed(
    db: AsyncSession = DbSession,
    # OPTIONAL, not required. The feed shipped readable without a token and
    # stays that way; the principal is here only so `liked_by_me` and
    # `bookmarked_by_me` can be answered for a signed-in reader.
    principal: Principal | None = Depends(get_optional_principal),
    limit: int = LimitQuery,
    offset: int = OffsetQuery,
):
    posts, next_offset = await list_feed(db, principal, limit, offset)
    return PostList(items=[_post_out(post) for post in posts], next_offset=next_offset)


@router.get("/posts/{post_id}", response_model=PostOut)
async def read_post(
    post_id: UUID,
    db: AsyncSession = DbSession,
    principal: Principal | None = Depends(get_optional_principal),
):
    """One post, identical in shape to a feed row - counts and viewer flags included.

    Exists so a deep link does not depend on the feed having been loaded first.
    404 for missing OR not-approved: a flagged post must not stay reachable by
    saved URL, or reporting would be cosmetic.
    """
    try:
        post = await get_post(db, post_id, principal)
    except SocialError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return _post_out(post)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_post(post_id: UUID, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    """Delete your own post. 403 on someone else's, NOT 404.

    Hard delete; comments and reactions cascade. Reports do not - see
    `delete_post` in the service layer.
    """
    try:
        await delete_post(db, principal, post_id)
    except SocialForbidden as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except SocialError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.post("/posts/{post_id}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
async def add_comment(
    post_id: UUID,
    payload: CommentCreate,
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
    authorization: str | None = Header(default=None),
):
    """Comment on a post, or reply to a comment via optional `parent_comment_id`.

    The SAME route for both - a reply is a comment, and splitting them would
    duplicate the post lookup, the name resolution and the moderation default
    across two endpoints that must not drift apart.

    Threads are exactly two levels deep and the SERVER enforces it: pass a
    reply's id as `parent_comment_id` and the new comment attaches to that
    reply's own parent instead of nesting deeper. The `parent_comment_id` on the
    response is therefore not always the one that was sent, and it is always a
    top-level id. 404 if the parent belongs to a different post.
    """
    try:
        comment = await create_comment(db, principal, post_id, payload, authorization)
    except SocialError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return _comment_out(comment)


@router.delete("/posts/{post_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_comment(
    post_id: UUID,
    comment_id: UUID,
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
):
    """Delete your own comment. 403 on someone else's.

    The `post_id` in the path is verified against the comment, so a comment
    cannot be deleted through an unrelated post.
    """
    try:
        await delete_comment(db, principal, post_id, comment_id)
    except SocialForbidden as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except SocialError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.post("/posts/{post_id}/react", response_model=ReactionOut, status_code=status.HTTP_201_CREATED)
async def add_reaction(post_id: UUID, payload: ReactionCreate, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    try:
        reaction = await create_reaction(db, principal, post_id, payload)
    except SocialError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return ReactionOut.model_validate(
        {
            "reaction_id": reaction.id,
            "post_id": reaction.post_id,
            "user_id": reaction.user_id,
            "user_role": reaction.user_role,
            "reaction_type": reaction.reaction_type,
            "created_at": reaction.created_at,
            "updated_at": reaction.updated_at,
        }
    )


@router.delete("/posts/{post_id}/react", status_code=status.HTTP_204_NO_CONTENT)
async def remove_reaction(post_id: UUID, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    """Un-react. IDEMPOTENT - 204 whether or not a reaction was there.

    A like button is a toggle over an unreliable network. 404ing the second tap
    of a double tap, or a retry after a timeout, would report an error for the
    state the user already wanted.
    """
    await delete_reaction(db, principal, post_id)


@router.post("/posts/{post_id}/bookmark", response_model=BookmarkOut, status_code=status.HTTP_201_CREATED)
async def add_bookmark(post_id: UUID, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    """Save a post. IDEMPOTENT - re-bookmarking returns the existing row, not 409."""
    try:
        bookmark = await create_bookmark(db, principal, post_id)
    except SocialError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return BookmarkOut.model_validate(
        {
            "bookmark_id": bookmark.id,
            "post_id": bookmark.post_id,
            "user_id": bookmark.user_id,
            "created_at": bookmark.created_at,
            "updated_at": bookmark.updated_at,
        }
    )


@router.delete("/posts/{post_id}/bookmark", status_code=status.HTTP_204_NO_CONTENT)
async def remove_bookmark(post_id: UUID, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    """Unsave. IDEMPOTENT, like un-reacting."""
    await delete_bookmark(db, principal, post_id)


@router.get("/me/bookmarks", response_model=PostList)
async def read_bookmarks(
    db: AsyncSession = DbSession,
    principal: Principal = Depends(get_current_principal),
    limit: int = LimitQuery,
    offset: int = OffsetQuery,
):
    """The caller's saved posts, newest-SAVED first.

    Returns `PostList` - the same envelope and the same item shape as the feed,
    deliberately, so the client reuses one mapper. Authenticated, unlike the
    feed: a bookmark list is inherently per-user and there is no anonymous
    answer to give.
    """
    posts, next_offset = await list_bookmarks(db, principal, limit, offset)
    return PostList(items=[_post_out(post) for post in posts], next_offset=next_offset)


@router.post("/posts/{post_id}/report", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
async def report_post(post_id: UUID, payload: ReportCreate, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    """Report a post. ONE REPORT FLAGS IT, which removes it from the feed.

    No threshold. Documented as a hazard in docs/api/social_service.md: a single
    malicious user can hide any post until a moderator restores it.
    """
    try:
        report = await create_report(db, principal, "post", post_id, payload)
    except SocialError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return _report_out(report)


@router.post("/comments/{comment_id}/report", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
async def report_comment(comment_id: UUID, payload: ReportCreate, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    """Report a comment. Flags it, which drops it from the comment list AND from
    `comment_count` - both already filter to approved."""
    try:
        report = await create_report(db, principal, "comment", comment_id, payload)
    except SocialError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return _report_out(report)


def _report_out(report) -> ReportOut:
    return ReportOut.model_validate(
        {
            "report_id": report.id,
            "reporter_user_id": report.reporter_user_id,
            "target_type": report.target_type,
            "target_id": report.target_id,
            "reason": report.reason,
            "note": report.note,
            # Always 'flagged' on a successful report - stated on the wire so
            # the client can drop the item without a refetch.
            "target_moderation_status": "flagged",
            "created_at": report.created_at,
            "updated_at": report.updated_at,
        }
    )


@router.post("/qa", response_model=QAOut, status_code=status.HTTP_201_CREATED)
async def ask_question(payload: QAQuestionCreate, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    try:
        question = await create_question(db, principal, payload)
    except SocialError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return _qa_out(question)


@router.get("/qa", response_model=list[QAOut])
async def read_questions(db: AsyncSession = DbSession):
    questions = await list_questions(db)
    return [_qa_out(question) for question in questions]


@router.post("/qa/{question_id}/answer", response_model=QAAnswer)
async def answer(question_id: UUID, payload: QAAnswerCreate, db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    try:
        question = await answer_question(db, principal, question_id, payload)
    except SocialError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return QAAnswer.model_validate(
        {
            "question_id": question.id,
            "answer": question.answer,
            "answered_by_user_id": question.answered_by_user_id,
            "answered_at": question.answered_at,
        }
    )


@router.get("/moderation", response_model=list[ModerationItemOut])
async def moderation_queue(db: AsyncSession = DbSession, principal: Principal = Depends(get_current_principal)):
    try:
        items = await list_moderation_queue(db, principal)
    except HTTPException:
        raise
    return [ModerationItemOut.model_validate(item) for item in items]

@router.get("/posts/{post_id}/comments", response_model=CommentList)
async def read_comments(
    post_id: UUID,
    db: AsyncSession = DbSession,
    _principal: Principal = Depends(get_current_principal),
    limit: int = LimitQuery,
    offset: int = OffsetQuery,
):
    """TOP-LEVEL comments only, each carrying `reply_count`.

    Replies are NOT inlined. They are fetched per parent, on demand, from
    `GET /v1/social/comments/{comment_id}/replies` - so a page of 20 is 20 rows
    and not 20 plus however many arguments broke out underneath them. Each item
    carries `reply_count`, which is everything "View 3 replies" needs.

    Note `comment_count` on the post counts ALL approved comments including
    replies, so it is legitimately larger than the number of items here.

    Authenticated: this is patient-written health discussion, not open web
    content, and the feed itself is already behind a token.
    """
    try:
        comments, next_offset = await list_comments(db, post_id, limit, offset)
    except SocialError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return CommentList(items=[_comment_out(c) for c in comments], next_offset=next_offset)


@router.get("/comments/{comment_id}/replies", response_model=CommentList)
async def read_replies(
    comment_id: UUID,
    db: AsyncSession = DbSession,
    _principal: Principal = Depends(get_current_principal),
    limit: int = LimitQuery,
    offset: int = OffsetQuery,
):
    """The replies under one comment - oldest first, paginated, approved only.

    Returns `CommentList`, the same envelope and item shape as the top-level
    list, so the client reuses one mapper and one pager. Every item has
    `parent_comment_id` set and `reply_count` 0, by the one-level rule.

    Counts match: this returns exactly the rows `reply_count` counted, so
    "View 3 replies" can never open onto a different number.

    Sits at `/comments/{id}/...` next to the existing
    `POST /comments/{id}/report` rather than under `/posts/{post_id}/...` - a
    comment id is globally unique here, and requiring the post id would add a
    second path segment the caller has to keep consistent for no integrity gain.

    404 only if the comment does not exist. A FLAGGED parent still serves its
    replies - a report against a parent is not a report against other people's
    replies, and the flagged body itself is never in this response. Passing a
    REPLY's id returns the thread it belongs to, mirroring the write rule.
    """
    try:
        replies, next_offset = await list_replies(db, comment_id, limit, offset)
    except SocialError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return CommentList(items=[_comment_out(c) for c in replies], next_offset=next_offset)
