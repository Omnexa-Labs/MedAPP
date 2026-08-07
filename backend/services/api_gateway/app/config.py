from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="GW_", extra="ignore")

    service_name: str = "api-gateway"
    # Audit finding #2: no default secret. Set GW_JWT_SECRET in env.
    # validate_jwt_secret() at startup refuses to boot in production with
    # an empty or known-weak value.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    otlp_endpoint: str | None = None
    log_level: str = "INFO"

    # Audit finding #6: CORS allow-list. Comma-separated origins (or empty
    # to disable CORS entirely). The old default was `["*"]` with
    # `allow_credentials=True` — undefined behaviour per the browser spec
    # AND wide-open to any origin. Set GW_CORS_ORIGINS explicitly per
    # environment.
    cors_origins: str = ""
    # Optional regex applied to the Origin header. Useful in development to
    # allow any localhost port without listing each one. Example:
    #   GW_CORS_ORIGIN_REGEX=http://localhost:\d+
    # Never set this in production — use cors_origins with an explicit list.
    cors_origin_regex: str = ""

    user_service_url: str = "http://user_service:8001"
    doctor_service_url: str = "http://doctor_service:8002"
    nurse_service_url: str = "http://nurse_service:8003"
    hospital_service_url: str = "http://hospital_service:8004"
    booking_service_url: str = "http://booking_service:8005"
    payment_service_url: str = "http://payment_service:8006"
    telemedicine_service_url: str = "http://telemedicine_service:8007"
    notification_service_url: str = "http://notification_service:8008"
    lab_service_url: str = "http://lab_service:8009"
    ehr_service_url: str = "http://ehr_service:8010"
    wearable_sync_service_url: str = "http://wearable_sync_service:8014"
    social_service_url: str = "http://social_service:8011"
    analytics_service_url: str = "http://analytics_service:8012"
    onboarding_service_url: str = "http://onboarding_service:8013"
    pharmacy_service_url: str = "http://pharmacy_service:8015"
    pharmacist_service_url: str = "http://pharmacist_service:8016"
    # inbox_service listens on 8013 inside its own container (compose
    # SERVICE_PORT). It shares that number with onboarding_service, which is
    # fine — they are different hostnames on the compose network.
    inbox_service_url: str = "http://inbox_service:8013"
    hms_service_url: str = "http://hms_service:8020"
    pms_service_url: str = "http://pms_service:8030"

    # Agents
    concierge_agent_url: str = "http://concierge_agent:9001"
    smart_recommend_agent_url: str = "http://smart_recommend_agent:9002"
    medical_chat_agent_url: str = "http://medical_chat_agent:9003"
    lab_reader_agent_url: str = "http://lab_reader_agent:9004"
    vitals_watcher_agent_url: str = "http://vitals_watcher_agent:9005"
    booking_agent_url: str = "http://booking_agent:9006"


settings = Settings()


ROUTES: dict[str, str] = {
    "/v1/auth": settings.user_service_url,
    "/v1/me": settings.user_service_url,
    "/profile": settings.user_service_url,
    "/v1/doctors": settings.doctor_service_url,
    "/v1/nurses": settings.nurse_service_url,
    "/v1/hospitals": settings.hospital_service_url,
    "/v1/bookings": settings.booking_service_url,
    "/v1/payments": settings.payment_service_url,
    "/v1/webhooks": settings.payment_service_url,
    "/v1/rooms": settings.telemedicine_service_url,
    "/v1/notifications": settings.notification_service_url,
    "/v1/me/preferences": settings.notification_service_url,
    "/v1/me/inbox": settings.notification_service_url,
    "/v1/lab": settings.lab_service_url,
    "/v1/patients": settings.ehr_service_url,
    "/v1/wearables": settings.wearable_sync_service_url,
    "/v1/social": settings.social_service_url,
    "/v1/admin": settings.analytics_service_url,
    "/v1/onboarding": settings.onboarding_service_url,
    "/v1/pharmacies": settings.pharmacy_service_url,
    "/v1/pharmacists": settings.pharmacist_service_url,
    # MESSAGING. Absent until 2026-08-06, which meant every /v1/threads call the
    # mobile app made returned the gateway's {"error":"unknown route"} 404 — the
    # service itself was healthy and complete the whole time. No new endpoint was
    # created here; this maps a route that already existed.
    "/v1/threads": settings.inbox_service_url,
    # ------------------------------------------------------------------
    # HMS and PMS are SEPARATE PRODUCTS, and are namespaced on purpose.
    # ------------------------------------------------------------------
    # They cannot be mounted on their own prefixes. Checked before adding:
    #
    #   * pms_service mounts "/v1/auth" — already mapped to user_service. A
    #     second "/v1/auth" key in this dict does not error, it SILENTLY WINS,
    #     so every login in the product would have been proxied to the pharmacy
    #     system.
    #   * pms_service also mounts "/v1/prescriptions", which the mobile app
    #     already calls.
    #   * hms_service mounts at bare "/v1", which would match every path not
    #     claimed by a longer prefix and turn clean 404s into HMS errors.
    #
    # So the public surface is namespaced and `_rewrite_path` strips the
    # namespace before proxying. No service was modified and no endpoint was
    # created — only the public address changes:
    #
    #   /v1/hms/patients  ->  hms_service  /v1/patients
    #   /v1/pms/auth      ->  pms_service  /v1/auth
    "/v1/hms": settings.hms_service_url,
    "/v1/pms": settings.pms_service_url,
    "/agents/concierge": settings.concierge_agent_url,
    "/agents/recommend": settings.smart_recommend_agent_url,
    "/agents/chat": settings.medical_chat_agent_url,
    "/agents/lab": settings.lab_reader_agent_url,
    "/agents/vitals": settings.vitals_watcher_agent_url,
    "/agents/booking": settings.booking_agent_url,
}
