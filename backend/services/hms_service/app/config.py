from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="HMS_", extra="ignore")

    service_name: str = "hms_service"
    mgmt_database_url: str = "postgresql+asyncpg://medapp:medapp@postgres:5432/medapp_hms_mgmt"
    mgmt_database_url_sync: str = "postgresql+psycopg://medapp:medapp@postgres:5432/medapp_hms_mgmt"
    tenant_database_url_template: str = (
        "postgresql+asyncpg://medapp:medapp@postgres:5432/hms_{tenant_slug}"
    )
    admin_database_url_sync: str = "postgresql+psycopg://medapp:medapp@postgres:5432/postgres"
    jwt_secret: str = "change-me-change-me-change-me-change-me"
    jwt_algorithm: str = "HS256"
    amqp_url: str = "amqp://medapp:medapp@rabbitmq:5672/"
    otlp_endpoint: str | None = None
    log_level: str = "INFO"
    dev_mode: bool = False
    dev_database_url: str = "postgresql+asyncpg://medapp:medapp@localhost:5432/hms_dev"
    tenant_pool_size: int = 5
    tenant_pool_max_overflow: int = 5
    tenant_pool_recycle: int = 1800


settings = Settings()
