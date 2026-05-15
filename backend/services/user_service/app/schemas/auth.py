from pydantic import BaseModel, EmailStr, Field, field_validator


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(min_length=1, max_length=255)
    last_name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    role: str = "user"

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "email": "user@medapp.com",
                    "password": "password123",
                    "first_name": "Amina",
                    "last_name": "Mensah",
                    "phone": "+233241234567",
                    "role": "user",
                }
            ]
        }
    }

    @field_validator("role")
    @classmethod
    def _validate_role(cls, v: str) -> str:
        # `user` is the default app account type; other roles are for provider
        # or admin workflows that require KYC or elevated access.
        allowed = {"user", "doctor", "nurse", "hospital_admin"}
        if v not in allowed:
            raise ValueError(f"role must be one of {sorted(allowed)}")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # access token TTL in seconds


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)
