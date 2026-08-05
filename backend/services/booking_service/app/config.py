from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="BOOKING_", extra="ignore")

    service_name: str = "booking_service"
    database_url: str = "postgresql+asyncpg://medapp:medapp@postgres:5432/medapp_bookings"
    rabbitmq_url: str = "amqp://medapp:medapp@rabbitmq:5672/"
    # Audit finding #2: no default secret. Set BOOKING_JWT_SECRET in env.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    otlp_endpoint: str | None = None
    log_level: str = "INFO"

    # Audit finding B-22: per-user booking-creation rate limit. Defaults
    # to 10 / 60s which is ~167x typical user pace (a real user books a
    # handful of slots per week). Tune via env in production if the
    # observed pattern differs.
    create_rate_max: int = 10
    create_rate_window_seconds: int = 60

    # Video provisioning. The base URL is config, named the way the gateway
    # names the same target (`telemedicine_service_url`), so a hostname is
    # never compiled into a call site. Override with
    # BOOKING_TELEMEDICINE_SERVICE_URL.
    telemedicine_service_url: str = "http://telemedicine_service:8007"
    # Tight on purpose: the patient is blocked on the 201 for their booking.
    # A slow room is worse than a null room they can retry into, because the
    # booking is the thing they must not lose.
    telemedicine_http_timeout_seconds: float = 5.0

    # Doctor-profile resolution. Used ONCE PER BOOKING, at creation, to learn
    # which user_service user owns the doctor_service profile the patient
    # booked (see services/doctor_directory.py). Deliberately not used on any
    # read path: the practitioner authorization check must not depend on a
    # network call. Override with BOOKING_DOCTOR_SERVICE_URL.
    doctor_service_url: str = "http://doctor_service:8002"
    doctor_http_timeout_seconds: float = 5.0


settings = Settings()
