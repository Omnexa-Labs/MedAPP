from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="EHR_", extra="ignore")

    service_name: str = "ehr_service"
    database_url: str = "postgresql+asyncpg://medapp:medapp@postgres:5432/medapp_ehrs"
    # Audit finding #2: no default secret. Set EHR_JWT_SECRET in env.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    user_service_url: str = "http://user_service:8001"
    doctor_service_url: str = "http://doctor_service:8002"
    pharmacy_service_url: str = "http://pharmacy_service:8015"
    clinical_handoff_secret: SecretStr = SecretStr("")
    otlp_endpoint: str | None = None
    log_level: str = "INFO"
    medication_push_enabled: bool = False
    expo_access_token: SecretStr = SecretStr("")

    # ── Domain events ───────────────────────────────────────────────────────
    # ehr_service publishes `ehr.vital.recorded` after a successful
    # POST /v1/patients/{patient_id}/vitals. Consumers (vitals_watcher_agent
    # and smart_recommend_agent today) trigger off the routing key.
    #
    # Note: wearable_sync also writes vitals via this endpoint, so a single
    # wearable upload produces N `ehr.vital.recorded` events plus one
    # `wearable.vitals.uploaded` event. Agent-level throttles handle the
    # duplication on the consumer side.
    #
    # Default OFF so unit tests don't try to connect to rabbit. Override
    # with EHR_PUBLISH_EVENTS=true in compose / production.
    rabbitmq_url: str = "amqp://medapp:medapp@rabbitmq:5672/"
    publish_events: bool = False


settings = Settings()
