from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="INBOX_", extra="ignore")

    service_name: str = "inbox_service"
    database_url: str = "postgresql+asyncpg://medapp:medapp@postgres:5432/medapp_inbox"
    # Audit finding #2: no default secret. Set INBOX_JWT_SECRET in env.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    otlp_endpoint: str | None = None
    log_level: str = "INFO"


settings = Settings()