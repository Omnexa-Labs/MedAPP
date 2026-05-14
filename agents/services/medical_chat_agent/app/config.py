from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MEDICAL_CHAT_", extra="ignore")

    service_name: str = "medical_chat_agent"
    model: str = "claude-opus-4-7"
    max_tokens: int = 16000
    effort: str = "high"

    anthropic_api_key: str = ""
    service_token: str = "change-me"

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


settings = Settings()
