import { client } from "@/lib/api/client";

export interface AccountSession {
  id: string;
  started_at: string;
  last_refreshed_at: string;
  expires_at: string;
  user_agent: string | null;
  ip_address: string | null;
  is_current: boolean;
}

export interface SessionPage {
  items: AccountSession[];
  next_offset: number | null;
  current_session_known: boolean;
  sign_out_delay_seconds: number;
}

export const sessionsApi = {
  list(offset = 0): Promise<SessionPage> {
    return client.get(`/v1/me/sessions?offset=${offset}&limit=25`);
  },
  revoke(id: string): Promise<{ current_session_revoked: boolean }> {
    return client.delete(`/v1/me/sessions/${encodeURIComponent(id)}`);
  },
};

export function sessionDeviceLabel(session: AccountSession): string {
  const agent = session.user_agent ?? "";
  if (/android/i.test(agent)) return "Android session";
  if (/iphone|ipad/i.test(agent)) return "iPhone or iPad session";
  if (/windows/i.test(agent)) return "Windows session";
  if (/macintosh|mac os/i.test(agent)) return "Mac session";
  if (/linux/i.test(agent)) return "Linux session";
  return "Device details unavailable";
}
