from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="WEARABLE_SYNC_", extra="ignore")

    service_name: str = "wearable_sync_service"
    database_url: str = "postgresql+asyncpg://medapp:medapp@postgres:5432/medapp_wearables"
    # Audit finding #2: no default secret. Set WEARABLE_SYNC_JWT_SECRET in env.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    ehr_service_url: str = "http://ehr_service:8010"
    otlp_endpoint: str | None = None
    log_level: str = "INFO"

    # ── Domain events ───────────────────────────────────────────────────────
    # Wearable sync publishes `wearable.vitals.uploaded` after a successful
    # /sync. Consumers (smart_recommend_agent today; future analytics) trigger
    # off the routing key.
    #
    # Default is OFF so unit tests don't attempt to connect to rabbit. Set
    # WEARABLE_SYNC_PUBLISH_EVENTS=true (and a real RABBITMQ_URL) in compose
    # and production.
    rabbitmq_url: str = "amqp://medapp:medapp@rabbitmq:5672/"
    publish_events: bool = False


settings = Settings()