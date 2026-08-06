// The queries behind `pharmacy-detail` (Figma `pharmacy_detail` 1022:16476).
//
//   record       GET /v1/pharmacies/{id}                     useQuery
//   pharmacists  GET /v1/pharmacists?pharmacy_id={id}        useQuery
//   stock        GET /v1/pharmacies/{id}/stock?drug_name=    useMutation
//
// WHY STOCK IS A MUTATION AND NOT A QUERY, despite being a GET. `useMutation`
// is the hook for "the user asked for this to happen now", and that is exactly
// what a stock check is: it is typed, submitted, and answered for one moment.
// As a `useQuery` it would inherit the global 60s `staleTime`, which means the
// second time a patient checks the same drug they get a cached "In stock" from
// a minute ago with no request made — on a page whose whole premise is that the
// number moves during the day. It would also refetch on remount, re-asking a
// question nobody asked twice. `mutateAsync` keyed on nothing, cached never, is
// the honest shape.
//
// The pharmacists list REUSES `careApi.listPharmacists` rather than adding a
// `GET /v1/pharmacies/{id}/pharmacists` client method: there is no such route.
// Affiliation is a column on the pharmacist, in a different service, and
// `?pharmacy_id=` is how it is queried.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any Expo-specific
// code — none here.

import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";

import { careApi } from "@/features/care/api";
import type { PharmacyDetail, StockCheck } from "@/features/care/api";
import type { DirectoryEntry } from "@/features/care/types";

export const PHARMACY_QUERY_KEY = (id: string) => ["care", "pharmacy", id] as const;
export const PHARMACY_STAFF_QUERY_KEY = (id: string) =>
  ["care", "pharmacy-pharmacists", id] as const;

/** The record. See `useHospital` for why `enabled` guards the missing id. */
export function usePharmacy(pharmacyId: string | undefined): UseQueryResult<PharmacyDetail> {
  return useQuery({
    queryKey: PHARMACY_QUERY_KEY(pharmacyId ?? ""),
    queryFn: () => careApi.getPharmacy(pharmacyId as string),
    enabled: !!pharmacyId,
  });
}

/**
 * Pharmacists affiliated with this pharmacy.
 *
 * `only_listable` defaults TRUE server-side, so this is "the pharmacists this
 * pharmacy chose to publish", not "the pharmacists who work here". The empty
 * case is therefore a real and expected answer, and the frame draws it
 * (`EmptyState / No pharmacists listed` 1022:17448) rather than hiding the
 * section.
 */
export function usePharmacyPharmacists(
  pharmacyId: string | undefined,
  enabled: boolean,
): UseQueryResult<DirectoryEntry[]> {
  return useQuery({
    queryKey: PHARMACY_STAFF_QUERY_KEY(pharmacyId ?? ""),
    queryFn: () => careApi.listPharmacists({ pharmacyId, limit: 50 }),
    enabled: !!pharmacyId && enabled,
  });
}

/**
 * One "do you have X?" question. `mutate({ drugName })`; the answer lands on
 * `.data`, a 404 (this pharmacy publishes no live stock at all) on `.error`.
 */
export function usePharmacyStockCheck(
  pharmacyId: string | undefined,
): UseMutationResult<StockCheck, unknown, { drugName: string }> {
  return useMutation({
    mutationFn: ({ drugName }: { drugName: string }) =>
      careApi.checkStock(pharmacyId as string, drugName),
  });
}
