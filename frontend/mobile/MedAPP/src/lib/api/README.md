# lib/api/

The HTTP client. One configured fetch wrapper, one auth interceptor that attaches the token from `auth-store`, one error mapper that converts non-2xx responses into typed `ApiError`s.

Feature `api.ts` files import `client` from here. They MUST NOT call `fetch` / `axios` directly — that keeps logging, retries, auth, and error shapes consistent.
