from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="USER_", extra="ignore")

    service_name: str = "user-service"
    database_url: str = "postgresql+asyncpg://medapp:medapp@postgres:5432/medapp_users"
    rabbitmq_url: str = "amqp://medapp:medapp@rabbitmq:5672/"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_minutes: int = 15
    jwt_refresh_ttl_days: int = 30
    otlp_endpoint: str | None = None
    log_level: str = "INFO"


settings = Settings()
