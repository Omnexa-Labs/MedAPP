// Notifications API — notification_service.
//
// Two patient-facing surfaces, both already routed by the gateway:
//
//   GET  /v1/me/inbox         the notification bell's contents
//   GET  /v1/me/preferences   channel toggles
//   PUT  /v1/me/preferences   update them
//
// `POST /v1/notifications/send` is NOT wrapped. It is how one service asks this
// one to notify a user, and it takes `recipient_user_id` — a client method for
// it would be a way to send a notification to somebody else from a phone.
//
// `GET /v1/notifications` 404s through the gateway, with and without a trailing
// slash (verified 2026-08-07). It is the service-root handler, not a patient
// route, so nothing here calls it.
//
// ---------------------------------------------------------------------------
// PREFERENCES ARE CREATED ON FIRST READ
// ---------------------------------------------------------------------------
// `GET /v1/me/preferences` returns a full row for a user who has never set one,
// defaulting every channel to enabled. So there is no "unset" state to design
// for — but note what that means: a new user is opted IN to push, SMS, email
// and in-app by default. That is a product/consent question rather than a
// client one, and it is flagged in docs/api/notification_service.md.

import { client } from "@/lib/api/client";

export const INBOX_PATH = "/v1/me/inbox";
export const PREFERENCES_PATH = "/v1/me/preferences";

export type NotificationChannel = "push" | "sms" | "email" | "in_app";

interface InboxMessageWire {
  delivery_id: string;
  event_id: string;
  event_type: string;
  title: string;
  body: string;
  channel: NotificationChannel;
  status: string;
  delivered_at: string | null;
}

interface InboxListWire {
  items: InboxMessageWire[];
}

interface PreferencesWire {
  preference_id: string;
  user_id: string;
  locale: string;
  push_enabled: boolean;
  sms_enabled: boolean;
  email_enabled: boolean;
  in_app_enabled: boolean;
}

export interface InboxMessage {
  id: string;
  /**
   * The originating domain event, NOT the delivery. Several deliveries of the
   * same event (push AND in-app) share it, so de-duplicate on this rather than
   * on `id` if the bell should show one row per happening.
   */
  eventId: string;
  eventType: string;
  title: string;
  body: string;
  channel: NotificationChannel;
  /** Free text. Do not switch on it exhaustively. */
  status: string;
  /** Null while queued or failed — an undelivered notice is not "just old". */
  deliveredAtIso: string | null;
}

export interface NotificationPreferences {
  id: string;
  userId: string;
  locale: string;
  pushEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
}

const toMessage = (w: InboxMessageWire): InboxMessage => ({
  id: w.delivery_id,
  eventId: w.event_id,
  eventType: w.event_type,
  title: w.title,
  body: w.body,
  channel: w.channel,
  status: w.status,
  deliveredAtIso: w.delivered_at ?? null,
});

const toPreferences = (w: PreferencesWire): NotificationPreferences => ({
  id: w.preference_id,
  userId: w.user_id,
  locale: w.locale,
  pushEnabled: w.push_enabled,
  smsEnabled: w.sms_enabled,
  emailEnabled: w.email_enabled,
  inAppEnabled: w.in_app_enabled,
});

export const notificationsApi = {
  /** `GET /v1/me/inbox` — `{ items }`. */
  async listInbox(): Promise<InboxMessage[]> {
    const w = await client.get<InboxListWire>(INBOX_PATH);
    return (w.items ?? []).map(toMessage);
  },

  async getPreferences(): Promise<NotificationPreferences> {
    return toPreferences(await client.get<PreferencesWire>(PREFERENCES_PATH));
  },

  /**
   * `PUT`, not PATCH — the whole object is replaced.
   *
   * A caller MUST send every flag. Omitting one does not leave it alone; the
   * schema defaults it to `true`, so a partial update silently re-enables a
   * channel the user turned off. Read, spread, then write.
   */
  async updatePreferences(next: {
    locale: string;
    pushEnabled: boolean;
    smsEnabled: boolean;
    emailEnabled: boolean;
    inAppEnabled: boolean;
  }): Promise<NotificationPreferences> {
    return toPreferences(
      await client.put<PreferencesWire>(PREFERENCES_PATH, {
        locale: next.locale,
        push_enabled: next.pushEnabled,
        sms_enabled: next.smsEnabled,
        email_enabled: next.emailEnabled,
        in_app_enabled: next.inAppEnabled,
      }),
    );
  },
};
