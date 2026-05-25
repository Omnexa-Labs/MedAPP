from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="LAB_", extra="ignore")

    service_name: str = "lab_service"
    database_url: str = "postgresql+asyncpg://medapp:medapp@postgres:5432/medapp_labs"
    # Audit finding #2: no default secret. Set LAB_JWT_SECRET in env.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    otlp_endpoint: str | None = None
    log_level: str = "INFO"
    qdrant_collection: str = "lab_results"
    qdrant_vector_size: int = 8

    # ── Domain events ───────────────────────────────────────────────────────
    # lab_service publishes `lab.result.created` after a successful
    # /v1/lab/results/upload. Consumers (smart_recommend_agent today;
    # future analytics) trigger off the routing key.
    #
    # Default is OFF so unit tests don't attempt to connect to rabbit.
    # Compose / production override with LAB_PUBLISH_EVENTS=true and a
    # real RABBITMQ_URL.
    rabbitmq_url: str = "amqp://medapp:medapp@rabbitmq:5672/"
    publish_events: bool = False


settings = Settings()
