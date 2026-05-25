from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SMART_RECOMMEND_", extra="ignore")

    service_name: str = "smart_recommend_agent"
    llm_provider: str = "mock"
    max_tokens: int = 4096

    # JWT — used to verify /chat and /analyze callers. Must be shared with
    # user_service. Empty default fails in ENV=production (see
    # agents/shared/auth.py::validate_jwt_secret).
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"

    # Outbound service token. Empty default until short-lived JWTs are wired.
    service_token: str = ""

    user_service_url: str = "http://user_service:8001"
    doctor_service_url: str = "http://doctor_service:8002"
    nurse_service_url: str = "http://nurse_service:8003"
    hospital_service_url: str = "http://hospital_service:8004"
    booking_service_url: str = "http://booking_service:8005"
    payment_service_url: str = "http://payment_service:8006"
    notification_service_url: str = "http://notification_service:8008"
    lab_service_url: str = "http://lab_service:8009"
    ehr_service_url: str = "http://ehr_service:8010"

    log_level: str = "INFO"

    # ── Event-driven push (slice 2) ─────────────────────────────────────────
    # AMQP URL for the medapp.events topic exchange. Unset → consumer
    # doesn't start; /analyze still works as a pull-mode trigger.
    amqp_url: str = ""
    # Queue name (durable). Each agent gets its own queue so messages aren't
    # split across pods in unintended ways.
    event_queue: str = "smart_recommend.analyze_triggers"
    # Routing keys to bind. These are the events that should re-run
    # analysis for a patient. Other services need to start emitting them
    # before the consumer sees traffic.
    event_routing_keys: tuple[str, ...] = (
        "wearable.vitals.uploaded",
        "lab.result.created",
        "ehr.vital.recorded",
    )
    # Minimum seconds between consecutive analyses for the same patient,
    # to absorb event bursts.
    event_throttle_seconds: int = 300

    # ── Notification dispatch ───────────────────────────────────────────────
    # When notification_service_url is empty, the dispatcher becomes a no-op.
    # In tests we override the URL to empty so the agent doesn't hammer a
    # nonexistent endpoint. Per-patient + per-dedup_key suppression
    # prevents the same nudge from re-firing within this window even if
    # the agent throttle lets a second analysis through.
    notification_suppression_seconds: int = 6 * 3600


settings = Settings()
