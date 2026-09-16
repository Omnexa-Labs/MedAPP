import re
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class PmsHandoffDeployment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    web_origin: str
    handoff_secret: SecretStr = Field(min_length=32)

    @field_validator("web_origin")
    @classmethod
    def origin(cls, value):
        parsed = urlsplit(value)
        if (
            not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.path not in {"", "/"}
            or (
                parsed.scheme != "https"
                and not (
                    parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
                )
            )
        ):
            raise ValueError("PMS handoff requires an HTTPS origin or local development origin")
        port, host = parsed.port, parsed.hostname.lower()
        host = f"[{host}]" if ":" in host else host
        suffix = f":{port}" if port and port != {"http": 80, "https": 443}[parsed.scheme] else ""
        return f"{parsed.scheme}://{host}{suffix}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="USER_", extra="ignore")

    service_name: str = "user-service"
    onboarding_activation_secret: SecretStr = SecretStr("")
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

    # Independent Fernet key from the deployment secret store. No fallback to JWT keys.
    mfa_encryption_key: SecretStr | None = None

    # Comma-separated, environment-specific OAuth audiences. Blank disables the provider.
    google_client_ids: str = ""
    apple_client_ids: str = ""
    # Dedicated admin web audience and managed Workspace domains; blank keeps SSO off.
    admin_google_client_id: str = ""
    admin_workspace_domains: str = ""

    # Dedicated server-to-server credential. Never place it in Expo public config.
    partner_handoff_secret: SecretStr | None = None
    partner_web_origin: str = ""
    partner_return_uris: str = "medapp://onboarding-status"
    hms_handoff_secret: SecretStr | None = None
    hms_web_origin: str = ""
    hms_return_uris: str = "medapp://hospital-workspaces"
    pms_handoff_deployments: dict[str, PmsHandoffDeployment] = Field(default_factory=dict)
    pms_return_uris: str = "medapp://pharmacy-workspaces"
    pharmacy_service_url: str = "http://pharmacy_service:8015"

    @field_validator("pms_handoff_deployments")
    @classmethod
    def separate_pms_handoffs(cls, deployments):
        origins, secrets = set(), set()
        for key, item in deployments.items():
            secret = item.handoff_secret.get_secret_value()
            if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", key):
                raise ValueError("invalid PMS handoff deployment key")
            if item.web_origin in origins or secret in secrets:
                raise ValueError("PMS deployments require separate origins and handoff credentials")
            origins.add(item.web_origin)
            secrets.add(secret)
        return deployments

    # OTP
    otp_ttl_seconds: int = 300  # 5 min
    otp_max_attempts: int = 5
    otp_resend_cooldown_seconds: int = 30

    # Password reset
    password_reset_ttl_minutes: int = 30
    password_reset_resend_cooldown_seconds: int = Field(default=30, ge=1, le=300)

    # Outbound email is explicitly unavailable until a real transport is configured.
    smtp_host: str = ""
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_from_email: str = ""
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_security: Literal["starttls", "ssl", "none"] = "starttls"
    smtp_timeout_seconds: float = Field(default=10, gt=0, le=60)

    # Auth lockout (per-email login throttle)
    login_lockout_threshold: int = 5
    login_lockout_window_minutes: int = 15

    # Observability
    otlp_endpoint: str | None = None
    log_level: str = "INFO"

    # Events
    publish_events: bool = True


settings = Settings()
