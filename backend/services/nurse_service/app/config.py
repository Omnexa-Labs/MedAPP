from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="NURSE_", extra="ignore")

    service_name: str = "nurse_service"
    database_url: str = "postgresql+asyncpg://medapp:medapp@postgres:5432/medapp_nurses"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    otlp_endpoint: str | None = None
    log_level: str = "INFO"


settings = Settings()
