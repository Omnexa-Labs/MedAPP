'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { useAccount } from '@/components/auth';
import { useNavigation, useUnsavedChanges } from '@/components/navigation';
import {
  ApplicationAside,
  Button,
  Field,
  Notice,
  Stepper,
} from '@/components/ui';
import type { Application, Mode, PartnerType } from '@/lib/types';
import { useApplicationAction } from './application-hooks';
import { ActionError } from './action-error';
import { TeamEditor } from './team-editor';
import {
  changedDetails,
  detailKeys,
  detailsPayload,
  formValues,
  labels,
  mergeDraft,
  validateDetails,
  type DetailKey,
} from './details-model';
export function Details({
  application,
  kind,
  mode,
}: {
  application?: Application;
  kind: PartnerType;
  mode?: Mode;
}) {
  const { api, user } = useAccount();
  const navigation = useNavigation();
  const action = useApplicationAction(application?.application_id);
  const [baseline, setBaseline] = useState(() => ({
    version: application?.version,
    values: formValues(application, kind, user),
  }));
  const [values, setValues] = useState(baseline.values);
  const [errors, setErrors] = useState<Partial<Record<DetailKey, string>>>({});
  const [teamDirty, setTeamDirty] = useState(false);
  const dirty = detailKeys.some((key) => values[key] !== baseline.values[key]);
  const newer = Boolean(
    application && baseline.version !== application.version,
  );
  useUnsavedChanges(dirty || action.busy);
  useEffect(() => {
    if (application && newer && !dirty) {
      const next = formValues(application, kind, user);
      setBaseline({ version: application.version, values: next });
      setValues(next);
    }
  }, [application, newer, dirty, kind, user]);
  function change(key: DetailKey, value: string) {
    setValues((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  }
  const disabled = action.busy || action.mustReload;
  const missingTeam = Boolean(
    application?.partner_type === 'hospital' &&
    application.onboarding_mode === 'team' &&
    application.team_members.length === 0,
  );
  function field(key: DetailKey, optional = false, wide = false) {
    const limit =
      key === 'phone'
        ? 64
        : ['country', 'city'].includes(key)
          ? 128
          : key === 'website_url'
            ? 512
            : 255;
    return (
      <Field
        key={key}
        name={key}
        label={labels[key] + (optional ? ' (optional)' : '')}
        value={values[key]}
        onChange={(event) => change(key, event.target.value)}
        error={errors[key]}
        maxLength={limit}
        className={wide ? 'full-width' : ''}
        disabled={disabled}
        type={
          key === 'email'
            ? 'email'
            : key === 'phone'
              ? 'tel'
              : key === 'website_url'
                ? 'url'
                : 'text'
        }
        autoComplete={
          key === 'email'
            ? 'email'
            : key === 'phone'
              ? 'tel'
              : key === 'city'
                ? 'address-level2'
                : key === 'address_line1'
                  ? 'street-address'
                  : undefined
        }
        list={key === 'country' ? 'countries' : undefined}
      />
    );
  }
  async function save(exit: boolean) {
    if (!exit && missingTeam) return;
    if (disabled || teamDirty || (newer && dirty)) return;
    const invalid = validateDetails(values, kind, !exit);
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      document
        .querySelector<HTMLInputElement>(`[name="${Object.keys(invalid)[0]}"]`)
        ?.focus();
      return;
    }
    const saved = await action.run((signal) =>
      application
        ? api.update(
            application.application_id,
            baseline.version!,
            changedDetails(values, baseline.values, kind),
            signal,
          )
        : api.create(
            {
              ...detailsPayload(values, kind),
              partner_type: kind,
              ...(kind === 'hospital'
                ? { onboarding_mode: mode || 'facility' }
                : {}),
            },
            signal,
          ),
    );
    if (!saved) return;
    const next = formValues(saved, kind, user);
    setValues(next);
    setBaseline({ version: saved.version, values: next });
    const needsTeam =
      saved.partner_type === 'hospital' &&
      saved.onboarding_mode === 'team' &&
      !saved.team_members.length;
    navigation.afterSave(
      exit
        ? '/'
        : `/applications/${saved.application_id}/${needsTeam ? 'details' : 'credentials'}`,
    );
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void save(false);
  }
  const collisionKeys =
    application && newer
      ? detailKeys.filter(
          (key) =>
            values[key] !== baseline.values[key] &&
            (application[key] || '') !== baseline.values[key],
        )
      : [];
  return (
    <main className="workspace workspace--flow">
      <div className="page-heading">
        <h1>
          {kind === 'practitioner'
            ? 'Your professional details'
            : 'Business details'}
        </h1>
        <p>Save your information before adding your credentials.</p>
      </div>
      <Stepper step={1} />
      <ActionError {...action} creating={!application} />
      {newer && dirty && application && (
        <Notice>
          <h2>Saved details have changed</h2>
          <p>
            Your edits have been kept. Choose how to continue with the latest
            saved version.
          </p>
          {collisionKeys.length > 0 && (
            <dl className="conflict-list">
              {collisionKeys.map((key) => (
                <div key={key}>
                  <dt>{labels[key]}</dt>
                  <dd>
                    Saved: {application[key] || 'Empty'} · Your edit:{' '}
                    {values[key] || 'Empty'}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <div className="inline-actions">
            <Button
              variant="secondary"
              onClick={() => {
                const latest = formValues(application, kind, user);
                setValues(mergeDraft(values, baseline.values, latest));
                setBaseline({ version: application.version, values: latest });
              }}
            >
              Merge my edits
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const latest = formValues(application, kind, user);
                setValues(latest);
                setBaseline({ version: application.version, values: latest });
              }}
            >
              Use saved details
            </Button>
          </div>
        </Notice>
      )}
      <div className="application-columns">
        <form
          id="details-form"
          className="panel details-panel"
          noValidate
          onSubmit={submit}
        >
          <h2>
            {kind === 'practitioner'
              ? 'Professional identity'
              : 'Business identity'}
          </h2>
          <fieldset className="form-grid" disabled={disabled}>
            {kind === 'practitioner' && (
              <>
                {field('professional_first_name')}
                {field('professional_last_name')}
              </>
            )}
            {field('legal_name')}
            {field('display_name')}
            {kind === 'practitioner' && (
              <label className="field">
                <span>Professional role</span>
                <select
                  className="input"
                  name="practitioner_role"
                  value={values.practitioner_role}
                  onChange={(event) =>
                    change('practitioner_role', event.target.value)
                  }
                >
                  <option value="doctor">Doctor</option>
                  <option value="nurse">Nurse</option>
                </select>
              </label>
            )}
            {field('specialty', kind !== 'practitioner')}
            {field('license_number')}
            {field('registration_number', kind === 'practitioner')}
            {kind !== 'practitioner' && field('tax_id', true)}
          </fieldset>
          <hr />
          <h2>Contact &amp; location</h2>
          <fieldset className="form-grid" disabled={disabled}>
            {field('email')}
            {field('phone')}
            {field('country')}
            {field('city')}
            {field('address_line1', kind === 'practitioner', true)}
          </fieldset>
          <datalist id="countries">
            <option value="Ghana" />
            <option value="Uganda" />
            <option value="Kenya" />
            <option value="Nigeria" />
            <option value="United States" />
            <option value="United Kingdom" />
            <option value="Germany" />
          </datalist>
          <details className="additional-details">
            <summary>Additional information</summary>
            <div className="form-grid">
              {field('website_url', true, true)}
              <label className="field full-width">
                <span>Notes (optional)</span>
                <textarea
                  className="input"
                  name="notes"
                  rows={4}
                  value={values.notes}
                  onChange={(event) => change('notes', event.target.value)}
                  maxLength={10000}
                  disabled={disabled}
                />
              </label>
            </div>
          </details>
        </form>
        <ApplicationAside
          application={application}
          kind={kind}
          role={
            kind === 'practitioner'
              ? (values.practitioner_role as 'doctor' | 'nurse')
              : undefined
          }
          name={values.display_name || values.legal_name}
        />
      </div>
      {kind === 'hospital' &&
        (application?.onboarding_mode || mode) === 'team' && (
          <div className="panel team-panel">
            {application ? (
              <TeamEditor
                application={application}
                blocked={dirty || disabled}
                onDraftChange={setTeamDirty}
              />
            ) : (
              <Notice>
                Save your business details to add the care team before
                continuing.
              </Notice>
            )}
          </div>
        )}
      <footer className="flow-footer">
        <div>
          <Button
            variant="secondary"
            disabled={disabled || teamDirty || (newer && dirty)}
            onClick={() => {
              void save(true);
            }}
            busy={action.busy}
          >
            Save &amp; exit
          </Button>
          <Button
            type="submit"
            form="details-form"
            disabled={disabled || teamDirty || missingTeam || (newer && dirty)}
            busy={action.busy}
          >
            {kind === 'hospital' && mode === 'team' && !application
              ? 'Save and add team'
              : 'Save and continue'}
            <ArrowRight size={18} />
          </Button>
        </div>
      </footer>
    </main>
  );
}
