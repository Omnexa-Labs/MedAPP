from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="ONBOARDING_", extra="ignore")

    service_name: str = "onboarding_service"
    activation_enabled: bool = False
    activation_poll_seconds: int = Field(default=10, ge=1, le=300)
    activation_user_url: str = "http://user_service:8001"
    activation_doctor_url: str = "http://doctor_service:8002"
    activation_nurse_url: str = "http://nurse_service:8003"
    activation_hospital_url: str = "http://hospital_service:8004"
    activation_hms_url: str = "http://hms_service:8020"
    activation_pharmacy_url: str = "http://pharmacy_service:8015"
    activation_user_secret: SecretStr = SecretStr("")
    activation_doctor_secret: SecretStr = SecretStr("")
    activation_nurse_secret: SecretStr = SecretStr("")
    activation_hospital_secret: SecretStr = SecretStr("")
    activation_hms_secret: SecretStr = SecretStr("")
    activation_pharmacy_secret: SecretStr = SecretStr("")
    database_url: str = "postgresql+asyncpg://medapp:medapp@postgres:5432/medapp_onboarding"
    # Audit finding #2: no default secret. Set ONBOARDING_JWT_SECRET in env.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    # Private bucket; ADC/service-account credentials are supplied by the environment.
    gcs_bucket: str = ""
    document_max_bytes: int = Field(default=10 * 1024 * 1024, ge=1, le=10 * 1024 * 1024)
    document_limit: int = Field(default=20, ge=1, le=20)
    jwt_audience: str = "medapp.platform"
    jwt_issuer: str = "medapp"
    otlp_endpoint: str | None = None
    log_level: str = "INFO"


settings = Settings()
