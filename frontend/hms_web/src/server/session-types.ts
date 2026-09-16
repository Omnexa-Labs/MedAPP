import type { WebUser, Workspace } from "@/lib/session-types";
export interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}
export interface SessionRecord {
  tokens: Tokens;
  user: WebUser;
  deviceId: string;
  returnUrl?: string;
  scope: string;
  revision: number;
  accessExpiresAt: number;
  expiresAt: number;
  workspace: { token: string; expiresAt: number; value: Workspace } | null;
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
