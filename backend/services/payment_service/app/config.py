from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="PAYMENT_", extra="ignore")

    service_name: str = "payment_service"
    database_url: str = "postgresql+asyncpg://medapp:medapp@postgres:5432/medapp_payments"
    rabbitmq_url: str = "amqp://medapp:medapp@rabbitmq:5672/"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    otlp_endpoint: str | None = None
    log_level: str = "INFO"


settings = Settings()
