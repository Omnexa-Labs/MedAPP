from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="GW_", extra="ignore")

    service_name: str = "api-gateway"
    jwt_secret: str = "change-me-change-me-change-me-change-me"
    jwt_algorithm: str = "HS256"
    otlp_endpoint: str | None = None
    log_level: str = "INFO"

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
    "/agents/concierge": settings.concierge_agent_url,
    "/agents/recommend": settings.smart_recommend_agent_url,
    "/agents/chat": settings.medical_chat_agent_url,
    "/agents/lab": settings.lab_reader_agent_url,
    "/agents/vitals": settings.vitals_watcher_agent_url,
    "/agents/booking": settings.booking_agent_url,
}
