from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="TELEMEDICINE_", extra="ignore")

    service_name: str = "telemedicine_service"
    database_url: str = "postgresql+asyncpg://medapp:medapp@postgres:5432/medapp_telemedicines"
    rabbitmq_url: str = "amqp://medapp:medapp@rabbitmq:5672/"
    # Audit finding #2: no default secret. Set TELEMEDICINE_JWT_SECRET in env.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    otlp_endpoint: str | None = None
    log_level: str = "INFO"


settings = Settings()
