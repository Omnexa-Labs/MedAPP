// The device list. A REAL query — `/v1/wearables/devices` exists and is routed
// to wearable_sync_service through the gateway's ROUTES map.
//
// This is the first screen in the medications/wearables work whose content is not
// sample data, which is why the state derivation next door is written with the
// care it is: with a live endpoint there is now a failure path to get wrong.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { wearablesApi, type WearableDevice } from "../api";

export const WEARABLE_DEVICES_QUERY_KEY = ["wearables", "devices"] as const;

export function useWearableDevices(): UseQueryResult<WearableDevice[]> {
  return useQuery({
    queryKey: WEARABLE_DEVICES_QUERY_KEY,
    queryFn: () => wearablesApi.listDevices(),
  });
}
