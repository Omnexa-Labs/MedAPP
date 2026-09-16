from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class PmsDeploymentConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str = Field(min_length=1, max_length=128)
    api_url: str
    web_origin: str
    activation_secret: SecretStr
    stock_secret: SecretStr

    @field_validator("api_url", "web_origin")
    @classmethod
    def service_origin(cls, value):
        parsed = urlsplit(value)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.path not in {"", "/"}
        ):
            raise ValueError("deployment URLs must be HTTP(S) origins")
        port = parsed.port
        host = parsed.hostname.lower()
        host = f"[{host}]" if ":" in host else host
        suffix = f":{port}" if port and port != {"http": 80, "https": 443}[parsed.scheme] else ""
        return f"{parsed.scheme}://{host}{suffix}"

    @model_validator(mode="after")
    def separate_credentials(self):
        activation, stock = (
            self.activation_secret.get_secret_value(),
            self.stock_secret.get_secret_value(),
        )
        if min(len(activation), len(stock)) < 32 or activation == stock:
            raise ValueError(
                "deployment activation and stock secrets must be distinct and at least 32 characters"
            )
        parsed = urlsplit(self.web_origin)
        if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("remote pharmacy websites must use HTTPS")
        return self


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="PHARMACY_", extra="ignore")

    service_name: str = "pharmacy_service"
    database_url: str = "postgresql+asyncpg://medapp:medapp@postgres:5432/medapp_pharmacies"
    rabbitmq_url: str = "amqp://medapp:medapp@rabbitmq:5672/"
    otlp_endpoint: str | None = None
    log_level: str = "INFO"
    onboarding_activation_secret: SecretStr = SecretStr("")
    pms_deployments: dict[str, PmsDeploymentConfig] = Field(default_factory=dict)
    public_api_origin: str = "http://localhost:8000"

    @field_validator("public_api_origin")
    @classmethod
    def photo_origin(cls, value):
        origin = PmsDeploymentConfig.service_origin(value)
        parsed = urlsplit(origin)
        if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("public API origin must use HTTPS except on loopback")
        return origin

    @field_validator("pms_deployments")
    @classmethod
    def unique_deployment_configuration(cls, entries):
        import re

        urls, sites, credentials = set(), set(), set()
        for key, entry in entries.items():
            if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", key):
                raise ValueError("invalid PMS deployment key")
            secrets = {
                entry.activation_secret.get_secret_value(),
                entry.stock_secret.get_secret_value(),
            }
            if entry.api_url in urls or entry.web_origin in sites or credentials & secrets:
                raise ValueError("each PMS deployment requires separate origins and credentials")
            urls.add(entry.api_url)
            sites.add(entry.web_origin)
            credentials |= secrets
        return entries

    # Timeout for upstream stock calls. Keep tight — a slow pms_service
    # must not block the patient app's directory render.
    stock_http_timeout_seconds: float = Field(default=3.0, gt=0, le=10)


settings = Settings()
