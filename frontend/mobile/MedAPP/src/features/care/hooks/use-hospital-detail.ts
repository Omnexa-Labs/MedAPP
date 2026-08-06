// The three queries behind `hospital-detail` (Figma `hospital_detail` 1020:641).
//
// WHY THREE QUERIES AND NOT ONE. The backend has no composite endpoint, and the
// three parts fail differently enough that merging them would make the screen
// worse, not simpler:
//
//   record   GET /v1/hospitals/{id}        404 => the screen is a not-found panel
//   reviews  GET /v1/hospitals/{id}/reviews  200 [] for an unknown id; never 404
//   staff    GET /v1/hospitals/{id}/staff  401 if the token expired, 404 if gone
//
// If they were one query, a 401 on the roster would blank a hospital record the
// user can otherwise read. They are separate so a section can fail on its own
// and the rest of the page survives — which is what the frame draws (the record
// is one card, the roster is another).
//
// The two dependent queries are `enabled` only once the record has loaded, so a
// stale deep link fires ONE request and gets one 404, rather than three.
//
// Query-key shape follows `use-directory.ts`: ["care", …discriminators], so a
// blanket invalidation of the care surface still wipes these.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any Expo-specific
// code — none here.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { careApi } from "@/features/care/api";
import type {
  HospitalDetail,
  HospitalReview,
  HospitalStaffRoster,
} from "@/features/care/api";

export const HOSPITAL_QUERY_KEY = (id: string) => ["care", "hospital", id] as const;
export const HOSPITAL_REVIEWS_QUERY_KEY = (id: string) =>
  ["care", "hospital-reviews", id] as const;
export const HOSPITAL_STAFF_QUERY_KEY = (id: string) =>
  ["care", "hospital-staff", id] as const;

/**
 * The record itself. `enabled` is false without an id so a screen reached with
 * no param sits in `isPending` rather than firing `GET /v1/hospitals/undefined`
 * — a request that 422s and reads, in the logs, exactly like a real bad id.
 */
export function useHospital(hospitalId: string | undefined): UseQueryResult<HospitalDetail> {
  return useQuery({
    queryKey: HOSPITAL_QUERY_KEY(hospitalId ?? ""),
    queryFn: () => careApi.getHospital(hospitalId as string),
    enabled: !!hospitalId,
  });
}

/** Public reviews, newest first. Empty is the normal case, not an error. */
export function useHospitalReviews(
  hospitalId: string | undefined,
  enabled: boolean,
): UseQueryResult<HospitalReview[]> {
  return useQuery({
    queryKey: HOSPITAL_REVIEWS_QUERY_KEY(hospitalId ?? ""),
    queryFn: () => careApi.listHospitalReviews(hospitalId as string),
    enabled: !!hospitalId && enabled,
  });
}

/**
 * The care team roster — roles, titles and departments, with no names.
 * `namesAvailable` on the result is the server explaining that, and the screen
 * renders the explanation rather than a silently anonymous list.
 */
export function useHospitalStaff(
  hospitalId: string | undefined,
  enabled: boolean,
): UseQueryResult<HospitalStaffRoster> {
  return useQuery({
    queryKey: HOSPITAL_STAFF_QUERY_KEY(hospitalId ?? ""),
    queryFn: () => careApi.listHospitalStaff(hospitalId as string),
    enabled: !!hospitalId && enabled,
  });
}
