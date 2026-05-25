import { client } from "@/lib/api/client";
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

interface SignupRequestWire {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role?: string;
}

// ---- App-facing types ----------------------------------------------------

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface SignUpPayload {
  email: string;
  password: string;
  displayName: string;
}

// Composed payload from the 3-step sign-up flow. Step 2 / Step 3 fields are
// captured for future use (the user-service signup doesn't accept them yet);
// they'll be persisted via PATCH /me + a preferences endpoint once those land.
export interface SignUpFullPayload {
  // Step 1
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  password: string;
  // Step 2 — recorded client-side until /me PATCH is wired.
  dateOfBirth: string;
  bloodType?: string;
  gender: string;
  primaryGoal: string;
  // Step 3 — preferences (client-only until a prefs endpoint lands).
  enableBiometric: boolean;
  enableTwoFactor: boolean;
  shareAnonymousData: boolean;
}

// ---- Adapter -------------------------------------------------------------

function adaptUser(u: UserOutWire): User {
  // Backend has no displayName field; fold first + last into one.
  const displayName = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email;
  return {
    id: u.id,
    email: u.email,
    displayName,
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
  async login(payload: LoginPayload): Promise<LoginResponse> {
    const tokens = await client.post<TokenPairWire>("/v1/auth/login", payload, {
      withAuth: false,
    });
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
    // Backend signup takes first/last/phone/role only. Step 2 and Step 3 data
    // are deferred — they belong on PATCH /me + a preferences endpoint that
    // doesn't exist yet. Dropping them here is intentional, not a bug.
    const body: SignupRequestWire = {
      email: payload.email,
      password: payload.password,
      first_name: payload.firstName,
      last_name: payload.lastName,
      role: "user",
    };
    await client.post<UserOutWire>("/v1/auth/signup", body, { withAuth: false });
    return authApi.login({ email: payload.email, password: payload.password });
  },

  async me(): Promise<User> {
    const u = await client.get<UserOutWire>("/v1/me");
    return adaptUser(u);
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
};

// Convenience export for store/auth-store.ts hydration.
export function fetchCurrentUser(): Promise<User> {
  return authApi.me();
}
