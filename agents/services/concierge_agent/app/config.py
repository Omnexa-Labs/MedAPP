from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CONCIERGE_", extra="ignore")

    service_name: str = "concierge_agent"

    # LLM provider — "mock" until we pick one. See agents/shared/llm.py.
    llm_provider: str = "mock"
    max_tokens: int = 4096

    # JWT — used to verify /chat callers. Must be shared with user_service
    # which mints the tokens. Empty default fails in ENV=production
    # (see agents/shared/auth.py::validate_jwt_secret).
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"

    # Outbound service token: bearer the agent presents to backend services.
    # Long-term should be a minted JWT (like wearable_sync mints for EHR).
    # Empty default — backend services will reject the call until configured.
    service_token: str = ""

    booking_service_url: str = "http://booking_service:8005"
    user_service_url: str = "http://user_service:8001"
    doctor_service_url: str = "http://doctor_service:8002"
    hospital_service_url: str = "http://hospital_service:8004"
    ehr_service_url: str = "http://ehr_service:8010"
    notification_service_url: str = "http://notification_service:8008"

    log_level: str = "INFO"


settings = Settings()
