// Lab API — lab_service.
//
// TWO PREFIXES, and the distinction is an authorisation boundary, not a style:
//
//   /v1/me/lab/*   THE PATIENT'S OWN results. Scoped to the bearer token.
//   /v1/lab/*      CLINICIAN routes — ordering, uploading, reading one result
//                  by id. Access is checked per result, not per role.
//
// Only the patient-facing reads are wrapped here. `POST /v1/lab/orders` and
// `POST /v1/lab/results/upload` are clinician actions with no screen behind
// them yet, and `GET /v1/lab/results/{id}` is authorised individually — see the
// note on `_can_access_result` below.
//
// ---------------------------------------------------------------------------
// THE GATEWAY DID NOT ROUTE /v1/me/lab UNTIL 2026-08-07
// ---------------------------------------------------------------------------
// `/v1/me` maps to user_service, and there was no longer prefix for lab, so the
// longest-prefix match sent a patient asking for their OWN results to
// user_service, which returned 404. Verified live before and after the fix.
// This is the third routing gap of the same family in one day (inbox missing
// entirely, hms/pms colliding, this one shadowed) — always probe the real
// gateway before assuming a client is at fault.
//
// ---------------------------------------------------------------------------
// AUTHORISATION, WORTH KNOWING BEFORE ADDING A CLINICIAN SCREEN
// ---------------------------------------------------------------------------
// `_can_access_result` no longer grants every doctor access to every result.
// A doctor reaches a result only when they placed the order it belongs to
// (`order.ordered_by_user_id == principal`). A clinician screen that lists
// "all results" will therefore be mostly 403s by design, not by bug.

import { client } from "@/lib/api/client";

export const MY_LAB_PATH = "/v1/me/lab";
export const LAB_PATH = "/v1/lab";

// ---------------------------------------------------------------------------
// Wire types — app/schemas/lab.py
// ---------------------------------------------------------------------------

interface LabResultOutWire {
  result_id: string;
  patient_id: string;
  lab_order_id: string | null;
  uploaded_by_user_id: string;
  source: string;
  title: string;
  status: string;
  summary: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  external_url?: string | null;
  resulted_at?: string | null;
  created_at?: string;
}

interface LabResultListWire {
  items: LabResultOutWire[];
}

/**
 * Search returns `{ query, items }` (LabSearchResultsOut), NOT the bare
 * `{ items }` the list route returns. Verified live: the echoed `query` is
 * ignored here because the caller already has it, but the shape is recorded so
 * nobody "simplifies" this into the list type.
 */
interface LabSearchResultsWire {
  query: string;
  items: LabResultOutWire[];
}

interface LabSummaryWire {
  total_orders: number;
  open_orders: number;
  total_results: number;
  recent_results: LabResultOutWire[];
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface LabResult {
  id: string;
  patientId: string;
  /** Null for a patient upload with no matching order. */
  labOrderId: string | null;
  uploadedByUserId: string;
  /** e.g. `patient_upload`. Free text on the wire (max 64). */
  source: string;
  title: string;
  /** Free text (max 32 on orders). Do not switch on it exhaustively. */
  status: string;
  summary: string | null;
  fileName: string | null;
  mimeType: string | null;
  externalUrl: string | null;
  /** When the LAB produced it — may differ from upload time, and may be null. */
  resultedAtIso: string | null;
}

export interface LabSummary {
  totalOrders: number;
  openOrders: number;
  totalResults: number;
  recentResults: LabResult[];
}

function toResult(w: LabResultOutWire): LabResult {
  return {
    id: w.result_id,
    patientId: w.patient_id,
    labOrderId: w.lab_order_id ?? null,
    uploadedByUserId: w.uploaded_by_user_id,
    source: w.source,
    title: w.title,
    status: w.status,
    summary: w.summary ?? null,
    fileName: w.file_name ?? null,
    mimeType: w.mime_type ?? null,
    externalUrl: w.external_url ?? null,
    resultedAtIso: w.resulted_at ?? null,
  };
}

export const labApi = {
  /** `GET /v1/me/lab/results` — the caller's own results. */
  async listMyResults(): Promise<LabResult[]> {
    const w = await client.get<LabResultListWire>(`${MY_LAB_PATH}/results`);
    return (w.items ?? []).map(toResult);
  },

  /** `GET /v1/me/lab/summary` — counts plus the most recent results. */
  async getMySummary(): Promise<LabSummary> {
    const w = await client.get<LabSummaryWire>(`${MY_LAB_PATH}/summary`);
    return {
      totalOrders: w.total_orders ?? 0,
      openOrders: w.open_orders ?? 0,
      totalResults: w.total_results ?? 0,
      recentResults: (w.recent_results ?? []).map(toResult),
    };
  },

  /**
   * `GET /v1/me/lab/search?q=` — server-side search over the caller's results.
   *
   * Server-side ON PURPOSE: filtering client-side would mean pulling every lab
   * result a patient has ever had into memory to match a substring.
   *
   * BACKED BY QDRANT (`request.app.state.qdrant`), so this is vector search, not
   * SQL LIKE. It is a dependency the other two routes do not have: if Qdrant is
   * down, search can fail while results and summary keep working. Handle its
   * failure separately rather than treating it as one lab outage.
   */
  async searchMyResults(query: string): Promise<LabResult[]> {
    const w = await client.get<LabSearchResultsWire>(
      `${MY_LAB_PATH}/search?q=${encodeURIComponent(query)}`,
    );
    return (w.items ?? []).map(toResult);
  },
};
