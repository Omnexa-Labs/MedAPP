from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="WEARABLE_SYNC_", extra="ignore")

    service_name: str = "wearable_sync_service"
    database_url: str = "postgresql+asyncpg://medapp:medapp@postgres:5432/medapp_wearables"
    jwt_secret: str = "change-me-change-me-change-me-change-me"
    jwt_algorithm: str = "HS256"
    ehr_service_url: str = "http://ehr_service:8010"
    otlp_endpoint: str | None = None
    log_level: str = "INFO"


settings = Settings()