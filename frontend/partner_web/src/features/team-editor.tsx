'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useUnsavedChanges } from '@/components/navigation';
import { useAccount } from '@/components/auth';
import { Button, Field, ConfirmDialog, Notice } from '@/components/ui';
import type { Application, TeamMember } from '@/lib/types';
import { useApplicationAction } from './application-hooks';
import { ActionError } from './action-error';
export function TeamEditor({
  application,
  blocked,
  onDraftChange,
}: {
  application: Application;
  blocked: boolean;
  onDraftChange: (dirty: boolean) => void;
}) {
  const { api } = useAccount();
  const action = useApplicationAction(application.application_id);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const dirty = Boolean(name || role || email || action.busy);
  useUnsavedChanges(dirty);
  useEffect(() => {
    onDraftChange(dirty);
    return () => onDraftChange(false);
  }, [dirty, onDraftChange]);
  const disabled =
    blocked ||
    action.busy ||
    action.mustReload ||
    application.status !== 'draft';
  async function add() {
    if (!name.trim() || !role.trim()) {
      setError('Enter the team member’s name and role.');
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid team member email.');
      return;
    }
    setError('');
    const saved = await action.run((signal) =>
      api.addMember(
        application.application_id,
        application.version,
        {
          full_name: name.trim(),
          role: role.trim(),
          email: email.trim() || null,
        },
        signal,
      ),
    );
    if (saved) {
      setName('');
      setRole('');
      setEmail('');
    }
  }
  return (
    <section className="team-section">
      <h2>Care team</h2>
      <p className="muted">
        Add the people named in this application. This does not invite them or
        grant account access.
      </p>
      {blocked && <Notice>Save your details before changing the team.</Notice>}
      <ActionError {...action} />
      {error && <Notice danger>{error}</Notice>}
      <ul className="team-list">
        {application.team_members.map((member) => (
          <li key={member.member_id}>
            <div>
              <strong>{member.full_name}</strong>
              <p>
                {member.role}
                {member.email ? ` · ${member.email}` : ''}
              </p>
            </div>
            <Button
              variant="ghost"
              disabled={disabled}
              onClick={() => setRemoving(member)}
              aria-label={`Remove ${member.full_name}`}
            >
              <Trash2 size={18} />
            </Button>
          </li>
        ))}
      </ul>
      {application.team_members.length === 0 && (
        <p>Add at least one team member before continuing.</p>
      )}
      <fieldset
        className="form-grid"
        disabled={disabled || application.team_members.length >= 50}
      >
        <Field
          label="Team member name"
          name="team-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={255}
        />
        <Field
          label="Role"
          name="team-role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          maxLength={64}
        />
        <Field
          label="Email address (optional)"
          name="team-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={255}
        />
        <div className="field-action">
          <Button
            variant="secondary"
            onClick={() => {
              void add();
            }}
            disabled={disabled || application.team_members.length >= 50}
            busy={action.busy}
          >
            <Plus size={18} />
            Add team member
          </Button>
        </div>
      </fieldset>
      {(name || role || email) && (
        <Button
          variant="ghost"
          disabled={action.busy}
          onClick={() => {
            setName('');
            setRole('');
            setEmail('');
            setError('');
          }}
        >
          Clear team member draft
        </Button>
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove team member?"
        onCancel={() => setRemoving(null)}
        confirm="Remove team member"
        onConfirm={() => {
          const member = removing;
          setRemoving(null);
          if (member)
            void action.run((signal) =>
              api.removeMember(
                application.application_id,
                application.version,
                member.member_id,
                signal,
              ),
            );
        }}
      >
        <p>{removing?.full_name} will be removed from this application.</p>
      </ConfirmDialog>
    </section>
  );
}
