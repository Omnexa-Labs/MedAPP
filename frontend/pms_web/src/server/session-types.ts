import type { Pharmacy, StaffUser } from "@/lib/session-types";
export interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}
export interface SessionRecord {
  returnUrl?: string;
  scope: string;
  revision: number;
  expiresAt: number;
  platform: {
    tokens: Tokens;
    accountId: string;
    deviceId: string;
    accessExpiresAt: number;
  } | null;
  credential: { token: string; expiresAt: number };
  user: StaffUser;
  pharmacy: Pharmacy;
}
export interface SessionStore {
  get(id: string): Promise<SessionRecord | null>;
  create(id: string, value: SessionRecord): Promise<void>;
  commit(
    id: string,
    owner: string,
    revision: number,
    value: SessionRecord,
  ): Promise<boolean>;
  remove(id: string, scope?: string): Promise<boolean>;
  lock(id: string, owner: string): Promise<boolean>;
  unlock(id: string, owner: string): Promise<void>;
}
