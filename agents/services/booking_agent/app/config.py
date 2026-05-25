from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BOOKING_", extra="ignore")

    service_name: str = "booking_agent"
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


settings = Settings()
