import { describe, expect, it } from 'vitest';
import {
  changedDetails,
  detailsPayload,
  formValues,
  mergeDraft,
  validateDetails,
} from '../src/features/details-model';
const user = {
  id: '11111111-1111-4111-8111-111111111111',
  first_name: 'Test',
  last_name: 'Applicant',
  email: 'applicant@example.com',
  role: 'patient',
  phone: null,
};
describe('saved application editing', () => {
  it('allows a minimal draft but requires complete details before credentials', () => {
    const values = formValues(undefined, 'practitioner', user);
    expect(validateDetails(values, 'practitioner', false)).toEqual({});
    expect(validateDetails(values, 'practitioner', true)).toHaveProperty(
      'license_number',
    );
    expect(validateDetails(values, 'practitioner', true)).toHaveProperty(
      'country',
    );
  });
  it('does not infer a business legal name or practitioner role from an account', () => {
    const values = formValues(undefined, 'pharmacy', user);
    expect(values.legal_name).toBe('');
    expect(detailsPayload(values, 'pharmacy')).not.toHaveProperty(
      'practitioner_role',
    );
  });
  it('only patches modified fields, including explicit removal', () => {
    const baseline = {
      ...formValues(undefined, 'practitioner', user),
      notes: 'Remove this note',
      city: 'Accra',
    };
    expect(
      changedDetails(
        { ...baseline, notes: '', city: ' Accra ' },
        baseline,
        'practitioner',
      ),
    ).toEqual({ notes: null });
  });
  it('merges unsaved fields while retaining unrelated updates from another tab', () => {
    const baseline = {
      ...formValues(undefined, 'practitioner', user),
      city: 'Accra',
      specialty: 'General practice',
    };
    const merged = mergeDraft({ ...baseline, city: 'Kumasi' }, baseline, {
      ...baseline,
      city: 'Tamale',
      specialty: 'Cardiology',
    });
    expect(merged.city).toBe('Kumasi');
    expect(merged.specialty).toBe('Cardiology');
  });
  it('rejects unsafe website schemes and malformed contact email', () => {
    const values = {
      ...formValues(undefined, 'practitioner', user),
      website_url: 'javascript:alert(1)',
      email: 'no-at-sign',
    };
    expect(validateDetails(values, 'practitioner', false)).toMatchObject({
      website_url: expect.any(String),
      email: expect.any(String),
    });
  });
});
