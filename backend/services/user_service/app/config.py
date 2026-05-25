from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="USER_", extra="ignore")

    service_name: str = "user-service"
    database_url: str = "postgresql+asyncpg://medapp:medapp@postgres:5432/medapp_users"
    rabbitmq_url: str = "amqp://medapp:medapp@rabbitmq:5672/"

    # JWT
    # Keep the fallback long enough to avoid weak-HMAC warnings in local tests;
    # production should always override this via `USER_JWT_SECRET`.
    # Audit finding #2: no default secret. Set USER_JWT_SECRET in env.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_minutes: int = 15
    jwt_refresh_ttl_days: int = 30
    jwt_issuer: str = "medapp.user-service"

    # OTP
    otp_ttl_seconds: int = 300  # 5 min
    otp_max_attempts: int = 5
    otp_resend_cooldown_seconds: int = 30

    # Password reset
    password_reset_ttl_minutes: int = 30

    # Auth lockout (per-email login throttle)
    login_lockout_threshold: int = 5
    login_lockout_window_minutes: int = 15

    # Observability
    otlp_endpoint: str | None = None
    log_level: str = "INFO"

    # Events
    publish_events: bool = True


settings = Settings()
