// Wearables API — wearable_sync_service, `/v1/wearables`.
//
// Backs the Lifestyle screens' device list and daily figures.
//
// ---------------------------------------------------------------------------
// SYNC IS AN INGEST ENDPOINT, NOT A "REFRESH" BUTTON
// ---------------------------------------------------------------------------
// `POST /v1/wearables/sync` takes a device AND the samples to store — the
// CALLER supplies the readings. It does not go and fetch anything from Fitbit
// or Apple Health; nothing in this product talks to a vendor API.
//
// So a "Sync now" button wired to this would upload whatever the app already
// had, which is nothing, and then report success. `syncSamples` is exposed
// because a real HealthKit / Health Connect bridge would use it, and is named
// to make the direction obvious.
//
// ---------------------------------------------------------------------------
// A SAMPLE CAN BE STORED AND STILL NOT REACH THE MEDICAL RECORD
// ---------------------------------------------------------------------------
// `sync_status`, `sync_error`, `synced_to_ehr` and `ehr_vital_id` describe a
// SECOND hop: wearable_sync_service forwards a sample into ehr_service, and
// that can fail independently. `syncedToEhr === false` means the reading is in
// the wearable store but NOT in the medical record — a clinician looking at
// vitals will not see it. Any UI claiming "shared with your doctor" must read
// that flag, not merely the presence of a sample.

import { client } from "@/lib/api/client";

export const WEARABLES_PATH = "/v1/wearables";

interface DeviceWire {
  device_id: string;
  owner_user_id: string;
  provider: string;
  external_id: string;
  display_name: string | null;
  is_active: boolean;
  last_synced_at: string | null;
}

interface SampleWire {
  sample_id: string;
  device_id: string;
  owner_user_id: string;
  kind: string;
  value: string;
  unit: string | null;
  recorded_at: string;
  sync_status: string;
  sync_error: string | null;
  synced_to_ehr: boolean;
  ehr_vital_id: string | null;
}

interface DeviceListWire {
  items: DeviceWire[];
}
interface SampleListWire {
  items: SampleWire[];
}

interface SummaryWire {
  total_devices: number;
  active_devices: number;
  total_samples: number;
  synced_samples: number;
  failed_samples: number;
  recent_samples: SampleWire[];
}

export interface WearableDevice {
  id: string;
  provider: string;
  /** The vendor id. Not for display — `displayName` is, and may be null. */
  externalId: string;
  displayName: string | null;
  isActive: boolean;
  /** Null for a device registered but never synced. */
  lastSyncedAtIso: string | null;
}

export interface WearableSample {
  id: string;
  deviceId: string;
  /** Free text (max 64), NOT an enum. Do not switch on it exhaustively. */
  kind: string;
  /** A STRING on the wire. Never parse it as a number. */
  value: string;
  unit: string | null;
  recordedAtIso: string;
  syncStatus: string;
  syncError: string | null;
  /** FALSE means it is not in the medical record. See the header. */
  syncedToEhr: boolean;
  ehrVitalId: string | null;
}

export interface WearableSummary {
  totalDevices: number;
  activeDevices: number;
  totalSamples: number;
  syncedSamples: number;
  failedSamples: number;
  recentSamples: WearableSample[];
}

const toDevice = (w: DeviceWire): WearableDevice => ({
  id: w.device_id,
  provider: w.provider,
  externalId: w.external_id,
  displayName: w.display_name,
  isActive: w.is_active,
  lastSyncedAtIso: w.last_synced_at ?? null,
});

const toSample = (w: SampleWire): WearableSample => ({
  id: w.sample_id,
  deviceId: w.device_id,
  kind: w.kind,
  value: w.value,
  unit: w.unit ?? null,
  recordedAtIso: w.recorded_at,
  syncStatus: w.sync_status,
  syncError: w.sync_error ?? null,
  syncedToEhr: w.synced_to_ehr,
  ehrVitalId: w.ehr_vital_id ?? null,
});

export const wearablesApi = {
  async listDevices(): Promise<WearableDevice[]> {
    const w = await client.get<DeviceListWire>(`${WEARABLES_PATH}/devices`);
    return (w.items ?? []).map(toDevice);
  },

  async getSummary(): Promise<WearableSummary> {
    const w = await client.get<SummaryWire>(`${WEARABLES_PATH}/summary`);
    return {
      totalDevices: w.total_devices ?? 0,
      activeDevices: w.active_devices ?? 0,
      totalSamples: w.total_samples ?? 0,
      syncedSamples: w.synced_samples ?? 0,
      failedSamples: w.failed_samples ?? 0,
      recentSamples: (w.recent_samples ?? []).map(toSample),
    };
  },

  async listSamples(deviceId: string): Promise<WearableSample[]> {
    const w = await client.get<SampleListWire>(`${WEARABLES_PATH}/devices/${deviceId}/samples`);
    return (w.items ?? []).map(toSample);
  },

  /**
   * UPLOAD readings the caller already holds.
   *
   * Requires at least one sample (`min_length=1` on the wire), so an empty
   * "sync" is a 422 rather than a no-op — which is another reason this cannot
   * stand in for a refresh button.
   */
  async syncSamples(input: {
    provider: string;
    externalId: string;
    displayName?: string;
    samples: { kind: string; value: string; unit?: string; recordedAtIso: string }[];
  }) {
    return client.post(`${WEARABLES_PATH}/sync`, {
      device: {
        provider: input.provider,
        external_id: input.externalId,
        display_name: input.displayName ?? null,
      },
      samples: input.samples.map((s) => ({
        kind: s.kind,
        value: s.value,
        unit: s.unit ?? null,
        recorded_at: s.recordedAtIso,
        source_payload: {},
      })),
    });
  },
};
