export type PartnerType = 'practitioner' | 'pharmacy' | 'hospital';
export type Mode = 'facility' | 'team';
export type Role = 'doctor' | 'nurse';
export interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: string;
}
export interface Identity {
  user: User;
  scope: string;
  returnAvailable?: boolean;
}
export interface ActivationStatus {
  state:
    | 'not_started'
    | 'pending'
    | 'retry'
    | 'attention_required'
    | 'setup_required'
    | 'active';
  attempts: number;
  reason: string | null;
  profile_id: string | null;
  activated_at: string | null;
}
export interface DocumentRecord {
  document_id: string;
  kind: string;
  label: string | null;
  url: string;
  verified: boolean;
  content_type?: string;
  size_bytes?: number;
  uploaded_at: string;
  verified_at?: string | null;
  verified_by_user_id?: string | null;
}
export interface TeamMember {
  member_id: string;
  full_name: string;
  role: string;
  email?: string | null;
  title?: string | null;
}
export interface ApplicationDetails {
  practitioner_role?: Role | null;
  professional_first_name?: string | null;
  professional_last_name?: string | null;
  legal_name: string;
  display_name: string;
  specialty?: string | null;
  license_number?: string | null;
  registration_number?: string | null;
  tax_id?: string | null;
  country?: string | null;
  city?: string | null;
  address_line1?: string | null;
  email?: string | null;
  phone?: string | null;
  website_url?: string | null;
  notes?: string | null;
}
export interface Application extends ApplicationDetails {
  application_id: string;
  version: number;
  partner_type: PartnerType;
  onboarding_mode: Mode | null;
  status: string;
  submitted_by_user_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  documents: DocumentRecord[];
  team_members: TeamMember[];
  attestation_version?: string | null;
  attested_at?: string | null;
}
export interface Requirements {
  required_fields: string[];
  required_document_kinds: string[];
  allowed_document_kinds: string[];
  allowed_content_types: string[];
  max_document_bytes: number;
  max_documents: number;
  requires_team_member: boolean;
  attestation_version: string;
  attestation_text: string;
}
export interface ApplicationEvent {
  event_id: string;
  actor_id: string;
  action: string;
  application_version: number;
  created_at: string;
  details: Record<string, unknown>;
}
export const typeNames: Record<PartnerType, string> = {
  practitioner: 'Individual practitioner',
  pharmacy: 'Pharmacy',
  hospital: 'Hospital or Clinic',
};
export const documentNames: Record<string, string> = {
  medical_license: 'Medical license',
  nursing_license: 'Nursing license',
  government_id: 'Government-issued ID',
  board_certificate: 'Board certification',
  registration_certificate: 'Registration certificate',
  pharmacy_license: 'Pharmacy license',
  hospital_license: 'Hospital license',
  tax_certificate: 'Tax certificate',
};
export function titleCase(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}
export function formatDate(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
    : 'Date unavailable';
}
