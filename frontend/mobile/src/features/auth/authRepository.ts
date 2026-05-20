import { AxiosError } from "axios";
import { apiClient } from "@/core/network/apiClient";
import { env } from "@/core/config/env";
import {
  type AuthApiUser,
  type AuthUser,
  type LoginResult,
  toAuthUser,
} from "@/features/auth/types";

export interface AuthRepository {
  login(email: string, password: string): Promise<LoginResult>;
  me(): Promise<AuthUser>;
}

class HttpAuthRepository implements AuthRepository {
  async login(email: string, password: string): Promise<LoginResult> {
    const loginRes = await apiClient.post<{ access_token: string }>("/auth/login", {
      email,
      password,
    });
    const accessToken = loginRes.data.access_token;

    const meRes = await apiClient.get<AuthApiUser>("/profile/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return { accessToken, user: toAuthUser(meRes.data) };
  }

  async me(): Promise<AuthUser> {
    const res = await apiClient.get<AuthApiUser>("/profile/me");
    return toAuthUser(res.data);
  }
}

class MockAuthRepository implements AuthRepository {
  async login(email: string, password: string): Promise<LoginResult> {
    await delay(400);
    if (password.length < 4) {
      throw new AxiosError(
        "invalid credentials",
        "ERR_BAD_REQUEST",
        undefined,
        undefined,
        {
          status: 401,
          statusText: "Unauthorized",
          data: { message: "invalid credentials" },
          headers: {},
          config: {} as never,
        }
      );
    }
    return {
      accessToken: "mock-token",
      user: {
        id: "demo",
        email,
        fullName: "Demo Patient",
        role: "patient",
      },
    };
  }

  async me(): Promise<AuthUser> {
    await delay(200);
    return {
      id: "demo",
      email: "demo@medapp.test",
      fullName: "Demo Patient",
      role: "patient",
    };
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const authRepository: AuthRepository = env.useMockApi
  ? new MockAuthRepository()
  : new HttpAuthRepository();
