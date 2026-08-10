from pydantic import AliasChoices, BaseModel, EmailStr, Field, field_validator


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(
        validation_alias=AliasChoices("first_name", "firstname", "firstName"),
        min_length=1,
        max_length=255,
    )
    last_name: str = Field(
        validation_alias=AliasChoices("last_name", "lastname", "surname", "lastName"),
        min_length=1,
        max_length=255,
    )
    phone: str | None = Field(default=None, max_length=32)
    role: str = "user"
    # Short-lived JWT issued by /auth/otp/signup-verify. When present and
    # valid, the matching contact (email or phone) is created as already
    # verified. When absent, the user is created unverified — the legacy
    # path, kept for back-compat during the mobile rollout.
    verification_token: str | None = Field(default=None, max_length=2048)

    model_config = {
        "populate_by_name": True,
        "json_schema_extra": {
            "examples": [
                {
                    "email": "user@medapp.com",
                    "password": "password123",
                    "firstname": "Amina",
                    "surname": "Mensah",
                    "phone": "+233241234567",
                    "role": "user",
                }
            ]
        }
    }

    @field_validator("role")
    @classmethod
    def _validate_role(cls, v: str) -> str:
        """PUBLIC SIGNUP GRANTS `user` AND NOTHING ELSE (2026-08-05).

        This validator used to accept `{"user", "doctor", "nurse",
        "hospital_admin"}` from the request body, and `auth_service.py` wrote it
        straight to `User.role`, from where `issue_tokens_for_user` stamped it
        into the access token. `kyc_status` was set to "pending" and NOTHING
        anywhere gated token issuance or any route on KYC.

        So every role-based authorization check in the platform was reachable by
        an anonymous attacker with one unauthenticated HTTP request. It chained:
        sign up as `doctor`, log in, and `lab_service._can_access_result` returned
        early for any doctor — an unauthenticated read of ANY patient's lab
        results. Both halves are fixed in this pass.

        A ROLE IS NOT SELF-SERVICE. Clinician and admin roles must be granted by
        an authenticated admin route or by a KYC-approval transition that a human
        or a verified credential drives. Until such a route exists, the only way
        to obtain one is a deliberate database change — which is the correct
        friction, not a gap.

        The unknown values are still REJECTED rather than silently coerced, so a
        client sending `role: "wizard"` gets a validation error. But a KNOWN
        elevated role is also refused here, with a message that says why: silently
        downgrading it would leave a caller believing they had signed up as a
        clinician.

        Regulation: Ghana Act 843 s.28 (appropriate technical measures) and
        HIPAA §164.308(a)(3)/(a)(4) — workforce authorization and minimum
        necessary both presuppose that a role is assigned, not claimed.
        """
        known = {"user", "doctor", "nurse", "hospital_admin"}
        if v not in known:
            raise ValueError(f"role must be one of {sorted(known)}")
        if v != "user":
            raise ValueError(
                "public signup can only create a 'user' account. Clinician and "
                "admin roles are granted through an authenticated provisioning "
                "flow, not requested at signup."
            )
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
    # When the client is exchanging the refresh token after a biometric
    # unlock, set this flag so the server can emit a `user.biometric_login`
    # audit event. Purely informational — does not change validation logic.
    biometric: bool = False


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
