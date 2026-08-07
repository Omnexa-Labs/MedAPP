from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="SOCIAL_", extra="ignore")

    service_name: str = "social_service"
    database_url: str = "postgresql+asyncpg://medapp:medapp@postgres:5432/medapp_social"
    # Audit finding #2: no default secret. Set SOCIAL_JWT_SECRET in env.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    # Service-to-service identity lookup. Internal only - this route is
    # deliberately absent from the api_gateway ROUTES table.
    user_service_url: str = "http://user_service:8001"
    # Off in tests and anywhere without a broker. Matches the publish_events
    # flag the publishing services carry.
    consume_events: bool = True
    rabbitmq_url: str = "amqp://medapp:medapp@rabbitmq:5672/"
    otlp_endpoint: str | None = None
    log_level: str = "INFO"


settings = Settings()
