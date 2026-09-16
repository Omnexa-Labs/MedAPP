'use client';
import { useState } from 'react';
import { ArrowRight, Hospital, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui';
import { useNavigation } from '@/components/navigation';
import type { Mode, PartnerType } from '@/lib/types';
function PharmacyIcon() {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 29h42c-2 11-7 18-12 22v6H22v-6c-6-4-10-12-12-22Z" />
      <path d="m31 29 15-19a5 5 0 0 1 8 6L43 29M32 36v13M26 42h12" />
    </svg>
  );
}
const choices = [
  {
    type: 'pharmacy' as const,
    title: 'Pharmacy',
    text: 'Register your pharmacy and submit its business and licensing details.',
    label: 'Select Pharmacy',
    icon: PharmacyIcon,
  },
  {
    type: 'hospital' as const,
    title: 'Hospital or Clinic',
    text: 'Apply for a facility or a care team with the appropriate organization credentials.',
    label: 'Select Facility',
    icon: Hospital,
  },
  {
    type: 'practitioner' as const,
    title: 'Individual Practitioner',
    text: 'Apply as a doctor or nurse and upload your professional credentials.',
    label: 'Select Practitioner',
    icon: Stethoscope,
  },
];
export function Selection() {
  const [selected, setSelected] = useState<PartnerType | ''>('');
  const [mode, setMode] = useState<Mode>('facility');
  const navigation = useNavigation();
  return (
    <main className="selection-container">
      <div className="selection-heading">
        <h1>Join the MedApp Network</h1>
        <p>Select your provider profile to start your application.</p>
      </div>
      <fieldset className="provider-options">
        <legend className="sr-only">Provider profile</legend>
        {choices.map(({ type, title, text, label, icon: Icon }) => (
          <label
            key={type}
            className={`provider-option ${selected === type ? 'selected' : ''}`}
          >
            <span className="provider-icon">
              <Icon />
            </span>
            <h2>{title}</h2>
            <p>{text}</p>
            <span className="provider-choice">
              <input
                type="radio"
                name="provider-type"
                value={type}
                checked={selected === type}
                onChange={() => setSelected(type)}
              />
              {label}
            </span>
          </label>
        ))}
      </fieldset>
      {selected === 'hospital' && (
        <fieldset className="mode-options">
          <legend>How will you apply?</legend>
          {(['facility', 'team'] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="onboarding-mode"
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {value === 'facility' ? 'As a facility' : 'As a care team'}
            </label>
          ))}
        </fieldset>
      )}
      <div className="selection-actions">
        <p>You can save your progress and return to your application.</p>
        <Button
          disabled={!selected}
          onClick={() =>
            navigation.navigate(
              `/new/details?kind=${selected}${selected === 'hospital' ? '&mode=' + mode : ''}`,
            )
          }
        >
          Get Started
          <ArrowRight size={20} />
        </Button>
      </div>
    </main>
  );
}
