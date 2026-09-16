export interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}
export interface WebUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  phone: string | null;
}
export interface SessionRecord {
  tokens: Tokens;
  user: WebUser;
  scope: string;
  accessExpiresAt: number;
  expiresAt: number;
  deviceId: string;
}
export interface SessionStore {
  get(id: string): Promise<SessionRecord | null>;
  create(id: string, value: SessionRecord): Promise<void>;
  saveIfPresent(id: string, value: SessionRecord): Promise<boolean>;
  remove(id: string): Promise<void>;
  lock(id: string, owner: string): Promise<boolean>;
  unlock(id: string, owner: string): Promise<void>;
}
