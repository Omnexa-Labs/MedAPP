from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="HOSPITAL_", extra="ignore")

    service_name: str = "hospital_service"
    database_url: str = "postgresql+asyncpg://medapp:medapp@postgres:5432/medapp_hospitals"
    # Audit finding #2: no default secret. Set HOSPITAL_JWT_SECRET in env.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    otlp_endpoint: str | None = None
    log_level: str = "INFO"
    onboarding_activation_secret: SecretStr = SecretStr("")
    hms_directory_secret: SecretStr = SecretStr("")


settings = Settings()
