import { client, type RequestOptions } from "@/lib/api/client";

export const ONBOARDING_PATH = "/v1/onboarding";

/** Free text on the wire despite the server-side StrEnum. Do not switch exhaustively. */
export type ApplicationStatus =
  "draft" | "submitted" | "under_review" | "approved" | "rejected" | string;

interface ApplicationWire {
  application_id: string;
  submitted_by_user_id: string;
  partner_type: string;
  onboarding_mode: string | null;
  legal_name: string;
  display_name: string | null;
  specialty: string | null;
  status: ApplicationStatus;
  country: string | null;
  city: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  created_at?: string;
}

interface ApplicationListWire {
  items: ApplicationWire[];
}

interface SummaryWire {
  total_count: number;
  draft_count: number;
  submitted_count: number;
  under_review_count: number;
  approved_count: number;
  rejected_count: number;
  recent_applications?: ApplicationWire[];
}

export interface PartnerApplication {
  id: string;
  ownerId: string;
  partnerType: string;
  onboardingMode: string | null;
  legalName: string;
  /** What to show. Falls back to the legal name, which is always present. */
  displayName: string | null;
  specialty: string | null;
  status: ApplicationStatus;
  country: string | null;
  city: string | null;
  submittedAtIso: string | null;
  reviewedAtIso: string | null;
  /**
   * Why it was rejected. Shown ONLY when the status is rejected — a stale
   * reason left on a resubmitted application would otherwise tell an approved
   * partner they had been turned down.
   */
  rejectionReason: string | null;
}

export interface OnboardingSummary {
  total: number;
  draft: number;
  submitted: number;
  underReview: number;
  approved: number;
  rejected: number;
  recent: PartnerApplication[];
}

const toApplication = (w: ApplicationWire): PartnerApplication => ({
  id: w.application_id,
  ownerId: w.submitted_by_user_id,
  partnerType: w.partner_type,
  onboardingMode: w.onboarding_mode ?? null,
  legalName: w.legal_name,
  displayName: w.display_name ?? null,
  specialty: w.specialty ?? null,
  status: w.status,
  country: w.country ?? null,
  city: w.city ?? null,
  submittedAtIso: w.submitted_at ?? null,
  reviewedAtIso: w.reviewed_at ?? null,
  rejectionReason: w.rejection_reason ?? null,
});

export const partnerApi = {
  /** Applications visible to the caller; admins can also see other owners. */
  async listApplications(options?: RequestOptions): Promise<PartnerApplication[]> {
    const w = await client.get<ApplicationListWire>(`${ONBOARDING_PATH}/applications`, options);
    return (w.items ?? []).map(toApplication);
  },

  async getApplication(applicationId: string): Promise<PartnerApplication> {
    return toApplication(
      await client.get<ApplicationWire>(`${ONBOARDING_PATH}/applications/${applicationId}`),
    );
  },

  /** Counts by status, plus the most recent applications. Verified live. */
  async getSummary(): Promise<OnboardingSummary> {
    const w = await client.get<SummaryWire>(`${ONBOARDING_PATH}/summary`);
    return {
      total: w.total_count ?? 0,
      draft: w.draft_count ?? 0,
      submitted: w.submitted_count ?? 0,
      underReview: w.under_review_count ?? 0,
      approved: w.approved_count ?? 0,
      rejected: w.rejected_count ?? 0,
      recent: (w.recent_applications ?? []).map(toApplication),
    };
  },
};
