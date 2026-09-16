import type {
  Application,
  ApplicationDetails,
  PartnerType,
  User,
} from '@/lib/types';
export const detailKeys = [
  'professional_first_name',
  'professional_last_name',
  'legal_name',
  'display_name',
  'practitioner_role',
  'specialty',
  'license_number',
  'registration_number',
  'tax_id',
  'country',
  'city',
  'address_line1',
  'email',
  'phone',
  'website_url',
  'notes',
] as const;
export type DetailKey = (typeof detailKeys)[number];
export type FormValues = Record<DetailKey, string>;
export const labels: Record<DetailKey, string> = {
  professional_first_name: 'First name',
  professional_last_name: 'Last name',
  legal_name: 'Legal name',
  display_name: 'Display name',
  practitioner_role: 'Professional role',
  specialty: 'Specialty',
  license_number: 'License number',
  registration_number: 'Registration number',
  tax_id: 'Tax ID',
  country: 'Country',
  city: 'City',
  address_line1: 'Street address',
  email: 'Email address',
  phone: 'Phone number',
  website_url: 'Website',
  notes: 'Additional information',
};
export function formValues(
  application: Application | undefined,
  kind: PartnerType,
  user: User,
): FormValues {
  const values = Object.fromEntries(
    detailKeys.map((key) => [key, application?.[key] || '']),
  ) as FormValues;
  if (!application) {
    values.email = user.email;
    values.phone = user.phone || '';
    if (kind === 'practitioner') {
      values.professional_first_name = user.first_name;
      values.professional_last_name = user.last_name;
      values.legal_name = values.display_name = [
        user.first_name,
        user.last_name,
      ]
        .filter(Boolean)
        .join(' ');
      values.practitioner_role = 'doctor';
    }
  }
  return values;
}
export function detailsPayload(
  values: FormValues,
  kind: PartnerType,
): ApplicationDetails {
  const payload: Record<string, string | null> = {};
  for (const key of detailKeys) {
    if (
      kind !== 'practitioner' &&
      [
        'practitioner_role',
        'professional_first_name',
        'professional_last_name',
      ].includes(key)
    )
      continue;
    payload[key] = values[key].trim() || null;
  }
  payload.display_name = values.display_name.trim() || values.legal_name.trim();
  return payload as unknown as ApplicationDetails;
}
export function changedDetails(
  values: FormValues,
  baseline: FormValues,
  kind: PartnerType,
): Partial<ApplicationDetails> {
  const current = detailsPayload(values, kind),
    saved = detailsPayload(baseline, kind);
  return Object.fromEntries(
    Object.entries(current).filter(
      ([key, value]) => value !== saved[key as keyof ApplicationDetails],
    ),
  );
}
export function validateDetails(
  values: FormValues,
  kind: PartnerType,
  complete: boolean,
): Partial<Record<DetailKey, string>> {
  const errors: Partial<Record<DetailKey, string>> = {};
  const required: DetailKey[] = ['legal_name'];
  if (complete)
    required.push(
      'country',
      'city',
      'email',
      'phone',
      'license_number',
      ...(kind === 'practitioner'
        ? ([
            'practitioner_role',
            'professional_first_name',
            'professional_last_name',
            'specialty',
          ] as DetailKey[])
        : (['address_line1', 'registration_number'] as DetailKey[])),
    );
  for (const key of required)
    if (!values[key].trim()) errors[key] = `${labels[key]} is required.`;
  if (
    values.email.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())
  )
    errors.email = 'Enter a valid email address.';
  if (values.website_url.trim()) {
    try {
      if (
        !['http:', 'https:'].includes(
          new URL(values.website_url.trim()).protocol,
        )
      )
        throw new Error();
    } catch {
      errors.website_url = 'Use a full http:// or https:// website address.';
    }
  }
  return errors;
}
export function mergeDraft(
  draft: FormValues,
  baseline: FormValues,
  latest: FormValues,
): FormValues {
  return Object.fromEntries(
    detailKeys.map((key) => [
      key,
      draft[key] === baseline[key] ? latest[key] : draft[key],
    ]),
  ) as FormValues;
}
