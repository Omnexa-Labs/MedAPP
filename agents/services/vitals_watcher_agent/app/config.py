from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="VITALS_WATCHER_", extra="ignore")

    service_name: str = "vitals_watcher_agent"
    llm_provider: str = "mock"
    max_tokens: int = 4096

    # JWT — verifies /chat callers. Empty default fails in ENV=production
    # (see agents/shared/auth.py::validate_jwt_secret).
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

    # ── Event-driven push ───────────────────────────────────────────────────
    # Subscribes to wearable.vitals.uploaded; publishes vitals.anomaly.detected.
    # Empty amqp_url disables both the subscriber AND the publisher — the
    # /chat endpoint still works for on-demand anomaly scans.
    amqp_url: str = ""
    event_queue: str = "vitals_watcher.scan_triggers"
    # `wearable.vitals.uploaded` covers wearable batch syncs (one event per
    # upload). `ehr.vital.recorded` covers manually-entered vitals and the
    # per-row writes from wearable_sync (one event per vital row). Agent-
    # level throttling absorbs the redundancy — see dispatcher.py.
    event_routing_keys: tuple[str, ...] = (
        "wearable.vitals.uploaded",
        "ehr.vital.recorded",
    )
    # Shorter than Smart Recommend's 300s default — acute monitoring should
    # react faster than longitudinal trend analysis.
    event_throttle_seconds: int = 60
    # How far back the dispatcher pulls vitals when scanning. 6 hours catches
    # the most recent batch from a wearable sync without exploding the
    # detect-all loop.
    scan_hours_back: int = 6

    # ── Notification dispatch ───────────────────────────────────────────────
    # When notification_service_url is empty, the dispatcher becomes a no-op
    # — tests run with no infrastructure. Vitals Watcher only notifies for
    # `warning` and `critical` (everything its detectors emit); there's no
    # `info` band in the acute lane.
    notification_suppression_seconds: int = 6 * 3600


settings = Settings()
