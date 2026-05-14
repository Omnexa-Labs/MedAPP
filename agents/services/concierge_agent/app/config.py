from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CONCIERGE_", extra="ignore")

    service_name: str = "concierge_agent"

    # LLM provider — "mock" until we pick one. See agents/shared/llm.py.
    llm_provider: str = "mock"
    max_tokens: int = 4096

    service_token: str = "change-me"

    booking_service_url: str = "http://booking_service:8005"
    user_service_url: str = "http://user_service:8001"
    doctor_service_url: str = "http://doctor_service:8002"
    hospital_service_url: str = "http://hospital_service:8004"
    ehr_service_url: str = "http://ehr_service:8010"
    notification_service_url: str = "http://notification_service:8008"

    log_level: str = "INFO"


settings = Settings()
