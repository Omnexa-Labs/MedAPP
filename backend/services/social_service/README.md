# Social Service

Port 8011. Owns doctor posts, comments, reactions, Q&A, and moderation.

Primary endpoints:
- `POST /v1/social/posts`
- `GET /v1/social/feed`
- `POST /v1/social/posts/{id}/comments`
- `POST /v1/social/posts/{id}/react`
- `POST /v1/social/qa`
- `POST /v1/social/qa/{id}/answer`

See `backend/README.md` for layout conventions.
