export type TelehealthViewerRole = "patient" | "practitioner";

/**
 * Canonical route/session identity shared by the profile, waiting room and call.
 * Values remain optional at the route boundary because a deep link can be
 * incomplete. Screens must render an unavailable state instead of inventing an
 * identity when {@link hasCompleteTelehealthSession} returns false.
 */
export interface TelehealthSessionParams {
  sessionId?: string;
  viewerRole: TelehealthViewerRole;
  providerId?: string;
  providerName?: string;
  providerSpecialty?: string;
  providerAvatar?: string;
  patientId?: string;
  patientName?: string;
  patientAvatar?: string;
  appointmentId?: string;
  startAt?: string;
}

export type TelehealthRouteParams = Record<string, string | string[] | undefined>;

export type CompleteTelehealthSessionParams = TelehealthSessionParams &
  Required<
    Pick<
      TelehealthSessionParams,
      | "sessionId"
      | "providerId"
      | "providerName"
      | "providerSpecialty"
      | "patientId"
      | "patientName"
      | "appointmentId"
      | "startAt"
    >
  >;

function firstValue(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  const trimmed = candidate?.trim();
  return trimmed || undefined;
}

/** Unknown or missing roles resolve to patient, the least-privileged view. */
export function parseViewerRole(value: string | string[] | undefined): TelehealthViewerRole {
  return firstValue(value)?.toLowerCase() === "practitioner" ? "practitioner" : "patient";
}

/** Normalises Expo Router's `string | string[]` search-param boundary. */
export function parseTelehealthSessionParams(
  params: TelehealthRouteParams,
): TelehealthSessionParams {
  return {
    sessionId: firstValue(params.sessionId),
    viewerRole: parseViewerRole(params.viewerRole),
    providerId: firstValue(params.providerId),
    providerName: firstValue(params.providerName),
    providerSpecialty: firstValue(params.providerSpecialty),
    providerAvatar: firstValue(params.providerAvatar),
    patientId: firstValue(params.patientId),
    patientName: firstValue(params.patientName),
    patientAvatar: firstValue(params.patientAvatar),
    appointmentId: firstValue(params.appointmentId),
    startAt: firstValue(params.startAt),
  };
}

export function hasCompleteTelehealthSession(
  params: TelehealthSessionParams,
): params is CompleteTelehealthSessionParams {
  return Boolean(
    params.sessionId &&
    params.providerId &&
    params.providerName &&
    params.providerSpecialty &&
    params.patientId &&
    params.patientName &&
    params.appointmentId &&
    params.startAt,
  );
}
