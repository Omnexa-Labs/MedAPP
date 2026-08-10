from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="INBOX_", extra="ignore")

    service_name: str = "inbox_service"
    database_url: str = "postgresql+asyncpg://medapp:medapp@postgres:5432/medapp_inbox"
    # Audit finding #2: no default secret. Set INBOX_JWT_SECRET in env.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    otlp_endpoint: str | None = None
    log_level: str = "INFO"

    # ── Attachments ────────────────────────────────────────────────────────
    # Where the bytes go. See `app/storage.py` for the choice and its limits.
    # /app/var is created and chowned to UID 10001 by `backend/Dockerfile`;
    # compose mounts a named volume there so a container rebuild does not
    # delete every voice note.
    attachment_root: str = "/app/var/attachments"

    # 8 MiB. NOT an arbitrary number:
    #   * `api_gateway` rejects any body over 10 MB (`MAX_BODY_BYTES`) unless
    #     the path is whitelisted. 8 MiB of file plus the multipart envelope
    #     stays under that, so uploads work through the gateway with NO
    #     gateway change and no new whitelist entry. Raising this past ~9.5 MB
    #     means editing `BODY_SIZE_WHITELIST_PREFIXES` too, or every upload
    #     dies at the edge with the gateway's own 413 and never reaches here.
    #   * A voice note is the common case and is far smaller: expo-audio's
    #     HIGH_QUALITY m4a preset is roughly 1 MB per minute.
    #   * An unbounded upload route on a medical service is a denial-of-service
    #     and an unbounded storage bill. There is no "no limit" option.
    max_attachment_bytes: int = 8 * 1024 * 1024

    # Voice notes only. 4 hours is not a UI affordance — it is a sanity bound
    # so a client bug cannot store 2**63 in an integer column the player
    # renders as a scrubber width.
    max_attachment_duration_ms: int = 4 * 60 * 60 * 1000


settings = Settings()


# ── Content-type allowlist ─────────────────────────────────────────────────
# ALLOWLIST, never a blocklist. A blocklist of dangerous types is a list of the
# ones someone thought of; this is the list of the three things the composer can
# actually produce (`frontend/mobile/MedAPP/src/features/chat/useComposerMedia.ts`):
# a recorded voice note, a picked image, a picked PDF.
#
# The declared content type is CLIENT-SUPPLIED and therefore not trustworthy on
# its own — a .exe announced as `image/png` passes this check. That is handled
# on the way OUT, not here: the fetch route replays the stored type with
# `X-Content-Type-Options: nosniff` and `Content-Disposition: attachment`, so a
# browser never sniffs, never executes and never renders it inline. This list
# bounds what the product supports; the response headers bound what the bytes
# can do.
AUDIO_CONTENT_TYPES: frozenset[str] = frozenset(
    {
        # expo-audio's RecordingPresets.HIGH_QUALITY writes .m4a, and the three
        # spellings below are all seen in the wild for it depending on platform
        # and picker.
        "audio/m4a",
        "audio/x-m4a",
        "audio/mp4",
        "audio/aac",
        "audio/mpeg",
        "audio/ogg",
        "audio/wav",
        "audio/x-wav",
        "audio/webm",
    }
)

IMAGE_CONTENT_TYPES: frozenset[str] = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
    }
)

DOCUMENT_CONTENT_TYPES: frozenset[str] = frozenset({"application/pdf"})

ALLOWED_CONTENT_TYPES: frozenset[str] = AUDIO_CONTENT_TYPES | IMAGE_CONTENT_TYPES | DOCUMENT_CONTENT_TYPES