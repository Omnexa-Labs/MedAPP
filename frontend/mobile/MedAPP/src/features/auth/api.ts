import { client, type RequestOptions } from "@/lib/api/client";
import type { User } from "@/types/user";

// Auth network calls.
//
// Backend routes (via api_gateway on :8000) are under `/v1`:
//   POST /v1/auth/signup    -> UserOut       (201, no tokens)
//   POST /v1/auth/login     -> TokenPair     (access_token, refresh_token, ...)
//   POST /v1/auth/refresh   -> TokenPair
//   POST /v1/auth/logout    -> 204
//   GET  /v1/me             -> UserOut
//
// The mobile app's User type uses camelCase + a single displayName; backend
// returns snake_case with first_name/last_name and a much richer body. We
// adapt at the API boundary so feature code never sees the wire shape.

// ---- Wire shapes (what the backend sends/receives) -----------------------

interface UserOutWire {
  id: string;
  email: string;
  phone: string | null;
  first_name: string;
  last_name: string;
  role: string;
  dob: string | null;
  gender: string | null;
  blood_type?: string | null;
  primary_goal?: string | null;
  email_verified: boolean;
  phone_verified: boolean;
  kyc_status: string;
  is_active: boolean;
}

interface TokenPairWire {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export class TwoFactorRequired extends Error {
  constructor(
    public readonly challengeToken: string,
    public readonly expiresIn: number,
  ) {
    super("Enter your authenticator or recovery code.");
    this.name = "TwoFactorRequired";
  }
}

interface LoginChallengeWire {
  mfa_required: true;
  challenge_token: string;
  expires_in: number;
}

interface SignupRequestWire {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role?: string;
  verification_token?: string;
  provider_ticket?: string;
  dob?: string;
  gender?: string;
  blood_type?: string;
  primary_goal?: string;
}

// Signup-OTP wire shapes (separate from the passwordless-login OTP).
interface SignupOtpStartWire {
  channel: "sms" | "email";
  phone?: string;
  email?: string;
}

interface SignupOtpVerifyWire extends SignupOtpStartWire {
  code: string;
}

interface SignupOtpVerifyResponseWire {
  verification_token: string;
  expires_in: number;
}

// ---- App-facing types ----------------------------------------------------

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export class SignupSignInError extends Error {
  constructor() {
    super("Your account was created and your details were saved. Sign in to continue.");
    this.name = "SignupSignInError";
  }
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  bloodType?: string | null;
  primaryGoal?: string | null;
}

export interface SignUpPayload {
  email: string;
  password: string;
  displayName: string;
}

// Personal details are saved atomically with the account. Security enrollment
// and care-team consent require separate flows; signup cannot activate them.
export interface SignUpFullPayload {
  providerTicket?: string;
  // Step 1 — single Full Name field (see schema.ts). Replaced
  // firstName/middleName/lastName; middleName is no longer collected anywhere
  // in the app (flagged). Split into first/last in signUpFull below.
  fullName: string;
  email: string;
  password: string;
  // Step 2 — persisted by the signup endpoint and restored through /me.
  dateOfBirth: string;
  bloodType?: string;
  gender: string;
  primaryGoal: string;
  // Verified contact from the OTP step between Step 1 and Step 2. The
  // backend marks the matching contact (email or phone) as verified at
  // creation time. Phone (when channel=sms) is persisted on the user;
  // email is already in step 1's email field.
  verification?: {
    channel: "sms" | "email";
    recipient: string;
    token: string;
  };
}

export interface SignupOtpStartPayload {
  channel: "sms" | "email";
  recipient: string;
}

export interface SignupOtpVerifyPayload {
  channel: "sms" | "email";
  recipient: string;
  code: string;
}

export interface SignupOtpVerifyResult {
  verificationToken: string;
  expiresIn: number;
}

// ---- Adapter -------------------------------------------------------------

function adaptUser(u: UserOutWire): User {
  // Backend has no displayName field; fold first + last into one.
  const displayName = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email;
  return {
    id: u.id,
    email: u.email,
    displayName,
    accountRole: u.role,
    firstName: u.first_name,
    lastName: u.last_name,
    dateOfBirth: u.dob ?? null,
    gender: u.gender ?? null,
    bloodType: u.blood_type ?? null,
    primaryGoal: u.primary_goal ?? null,
    // The wire User type has no avatarUrl yet; leave undefined.
    avatarUrl: undefined,
    // Backend role -> mobile Partner: only "user" maps cleanly today. Doctor /
    // nurse / hospital_admin are partner kinds, but the partner record shape
    // isn't returned by /me yet, so we leave it undefined.
    partner: undefined,
    // Backend doesn't return createdAt on UserOut. Use a placeholder so the
    // mobile User shape stays satisfied; refresh from a profile call later.
    createdAt: new Date(0).toISOString(),
  };
}

// ---- API surface ---------------------------------------------------------

export const authApi = {
  async providerSession(tokens: {
    access_token: string;
    refresh_token: string;
  }): Promise<LoginResponse> {
    try {
      const user = await client.get<UserOutWire>("/v1/me", {
        withAuth: false,
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        user: adaptUser(user),
      };
    } catch (error) {
      void authApi.signOut(tokens.refresh_token).catch(() => {});
      throw error;
    }
  },
  async updateProfile(payload: UpdateProfilePayload): Promise<User> {
    const user = await client.patch<UserOutWire>("/v1/me", {
      first_name: payload.firstName,
      last_name: payload.lastName,
      dob: payload.dateOfBirth,
      gender: payload.gender,
      blood_type: payload.bloodType,
      primary_goal: payload.primaryGoal,
    });
    return adaptUser(user);
  },

  async requestPasswordReset(email: string): Promise<{ resendAfterSeconds: number }> {
    const response = await client.post<{ status: string; resend_after_seconds?: number }>(
      "/v1/auth/password/forgot",
      { email },
      { withAuth: false },
    );
    return { resendAfterSeconds: response.resend_after_seconds ?? 30 };
  },

  async resetPassword(payload: { token: string; newPassword: string }): Promise<void> {
    await client.post(
      "/v1/auth/password/reset",
      { token: payload.token, new_password: payload.newPassword },
      { withAuth: false },
    );
  },

  async login(payload: LoginPayload): Promise<LoginResponse> {
    const tokens = await client.post<TokenPairWire | LoginChallengeWire>(
      "/v1/auth/login",
      payload,
      {
        withAuth: false,
      },
    );
    if ("mfa_required" in tokens)
      throw new TwoFactorRequired(tokens.challenge_token, tokens.expires_in);
    // Backend login returns tokens only; fetch the user separately. Set the
    // token explicitly for this one /me call so we don't depend on the auth
    // store having updated yet.
    const user = await client.get<UserOutWire>("/v1/me", {
      withAuth: false,
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      user: adaptUser(user),
    };
  },

  async completeTwoFactor(challengeToken: string, code: string): Promise<LoginResponse> {
    const tokens = await client.post<TokenPairWire>(
      "/v1/auth/two-factor/verify",
      { challenge_token: challengeToken, code },
      { withAuth: false },
    );
    try {
      const user = await client.get<UserOutWire>("/v1/me", {
        withAuth: false,
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        user: adaptUser(user),
      };
    } catch (error) {
      // The proof is consumed. Close this orphan session and ask for a new password login.
      void authApi.signOut(tokens.refresh_token).catch(() => {});
      throw error;
    }
  },

  // Legacy single-step signup (kept for callers that still want it).
  async signUp(payload: SignUpPayload): Promise<LoginResponse> {
    const [firstName, ...rest] = payload.displayName.trim().split(/\s+/);
    const lastName = rest.length > 0 ? rest.join(" ") : firstName;
    const body: SignupRequestWire = {
      email: payload.email,
      password: payload.password,
      first_name: firstName,
      last_name: lastName,
      role: "user",
    };
    await client.post<UserOutWire>("/v1/auth/signup", body, { withAuth: false });
    // Signup doesn't return tokens; log in immediately to get them.
    return authApi.login({ email: payload.email, password: payload.password });
  },

  async signUpFull(payload: SignUpFullPayload): Promise<LoginResponse> {
    // FLAGGED, needs a product/backend decision — do not treat as settled.
    // The UI collapsed first/middle/last into one Full Name field (the Figma
    // frame draws one input), but SignupRequestWire still requires both
    // first_name and last_name, so we whitespace-split. This is LOSSY:
    //   "Kwame"            -> first_name "Kwame",  last_name "Kwame"  (dup!)
    //   "Ama Serwaa Mensah"-> first_name "Ama",    last_name "Serwaa Mensah"
    // Mononyms are common in the markets docs/BRAND.md targets (GH/NG/KE), so
    // the correct fix is a backend that accepts a single legal name (or an
    // explicit optional surname field in the design), not a smarter heuristic.
    const [firstName, ...rest] = payload.fullName.trim().split(/\s+/);
    const lastName = rest.length > 0 ? rest.join(" ") : firstName;
    const body: SignupRequestWire = {
      email: payload.email,
      password: payload.password,
      first_name: firstName,
      last_name: lastName,
      role: "user",
      dob: payload.dateOfBirth,
      gender: payload.gender,
      blood_type: payload.bloodType,
      primary_goal: payload.primaryGoal,
    };
    // If the user verified a phone via OTP, persist it on the account so
    // the verified flag is meaningful.
    if (payload.verification?.channel === "sms") {
      body.phone = payload.verification.recipient;
    }
    if (payload.verification?.token) {
      body.verification_token = payload.verification.token;
    }
    if (payload.providerTicket) body.provider_ticket = payload.providerTicket;
    await client.post<UserOutWire>("/v1/auth/signup", body, { withAuth: false });
    try {
      return await authApi.login({ email: payload.email, password: payload.password });
    } catch {
      // Creation already committed. Retrying signup would report a duplicate
      // account even though the original personal details were saved correctly.
      throw new SignupSignInError();
    }
  },

  // Begin signup-time contact verification. Channel is "sms" or "email";
  // recipient is the E.164 phone or the email address. The backend
  // refuses (409) if the contact already belongs to a user — the caller
  // should map that to "looks like you already have an account".
  async signupOtpStart(payload: SignupOtpStartPayload): Promise<{
    expiresIn: number;
    resendAfterSeconds: number;
  }> {
    const wire: SignupOtpStartWire = { channel: payload.channel };
    if (payload.channel === "sms") wire.phone = payload.recipient;
    else wire.email = payload.recipient;
    const r = await client.post<{
      sent: boolean;
      expires_in: number;
      resend_after_seconds?: number;
    }>("/v1/auth/otp/signup-start", wire, { withAuth: false });
    return { expiresIn: r.expires_in, resendAfterSeconds: r.resend_after_seconds ?? 30 };
  },

  async signupOtpVerify(payload: SignupOtpVerifyPayload): Promise<SignupOtpVerifyResult> {
    const wire: SignupOtpVerifyWire = { channel: payload.channel, code: payload.code };
    if (payload.channel === "sms") wire.phone = payload.recipient;
    else wire.email = payload.recipient;
    const r = await client.post<SignupOtpVerifyResponseWire>("/v1/auth/otp/signup-verify", wire, {
      withAuth: false,
    });
    return { verificationToken: r.verification_token, expiresIn: r.expires_in };
  },

  async me(options?: RequestOptions): Promise<User> {
    const u = await client.get<UserOutWire>("/v1/me", options);
    return adaptUser(u);
  },

  // Exchange a stored refresh token for a fresh access/refresh pair.
  // Used by the biometric sign-in flow: biometric unlocks the keychain,
  // we read the refresh token, this call gets a new access token. The
  // backend rotates the refresh token on every call — the returned
  // refresh_token is the one to persist.
  //
  // `biometric` defaults to false. The biometric hook passes true so
  // the server emits a `user.biometric_login` audit + domain event.
  // The X-Device-Id header is attached by the api client automatically;
  // the backend uses it to bind this refresh chain to this install.
  async refresh(
    refreshToken: string,
    options?: {
      biometric?: boolean;
      onTokensRotated?: (tokens: { accessToken: string; refreshToken: string }) => Promise<void>;
    },
  ): Promise<LoginResponse> {
    const tokens = await client.post<TokenPairWire>(
      "/v1/auth/refresh",
      { refresh_token: refreshToken, biometric: options?.biometric ?? false },
      { withAuth: false },
    );
    // Persist the new credential before /me: a failed profile request must not
    // leave the caller retrying the already-consumed refresh token.
    await options?.onTokensRotated?.({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    });
    const user = await client.get<UserOutWire>("/v1/me", {
      withAuth: false,
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      user: adaptUser(user),
    };
  },

  async signOut(refreshToken: string): Promise<void> {
    // Backend logout is idempotent and takes the refresh token in the body so
    // it can be rotated/revoked server-side.
    await client.post<void>(
      "/v1/auth/logout",
      { refresh_token: refreshToken },
      { withAuth: false },
    );
  },

  /**
   * Change the signed-in user's password.
   *
   * A REAL endpoint: `user_service` mounts `password.router` at `/auth/password`,
   * so `POST /auth/password/change` exists, requires `CurrentUser`, and answers
   * 204. The gateway maps `/v1/auth` -> user_service and strips the `v1/` prefix
   * for that service alone (see api_gateway `_rewrite_path`), which is why the
   * public path carries `/v1` and the router's does not.
   *
   * `withAuth` is deliberately LEFT AT ITS DEFAULT of true — unlike login,
   * signup, logout and refresh, which pass `withAuth: false` because they carry
   * their own credential. This one is an authenticated action on the current
   * session and the server reads the user from the bearer token.
   *
   * Snake_case on the wire to match `ChangePasswordRequest`. A wrong current
   * password is a 400 with `{"detail": ...}`, which `parseError` surfaces as the
   * ApiError message — so callers should show `error.message` rather than
   * inventing copy.
   */
  async changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
    await client.post<void>("/v1/auth/password/change", {
      current_password: input.currentPassword,
      new_password: input.newPassword,
    });
  },
};

// Convenience export that existed solely for store/auth-store.ts hydration,
// which now calls `authApi.me()` directly. Kept as a named alias — it is a
// one-line re-export and removing a public name is not worth the churn.
export function fetchCurrentUser(): Promise<User> {
  return authApi.me();
}
