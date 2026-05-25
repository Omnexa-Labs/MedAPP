from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="PAYMENT_", extra="ignore")

    service_name: str = "payment_service"
    database_url: str = "postgresql+asyncpg://medapp:medapp@postgres:5432/medapp_payments"
    rabbitmq_url: str = "amqp://medapp:medapp@rabbitmq:5672/"
    # Audit finding #2: no default secret. Set PAYMENT_JWT_SECRET in env.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    otlp_endpoint: str | None = None
    log_level: str = "INFO"

    # ── Webhook signing secrets (audit findings C-8 + B-16) ─────────────────
    # Both webhooks fail closed on an empty secret — a payment forger cannot
    # spoof events on a misconfigured service. Set PAYMENT_STRIPE_WEBHOOK_SECRET
    # and PAYMENT_MPESA_WEBHOOK_SECRET via env in every environment that
    # exposes the webhook routes.
    stripe_webhook_secret: str = ""
    mpesa_webhook_secret: str = ""


settings = Settings()
