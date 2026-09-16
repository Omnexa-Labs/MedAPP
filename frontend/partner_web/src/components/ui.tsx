'use client';
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { AlertCircle, Check, LoaderCircle, LockKeyhole } from 'lucide-react';
import type { Application, PartnerType, Role } from '@/lib/types';
import { typeNames, titleCase } from '@/lib/types';
export function Button({
  variant = 'primary',
  busy,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`button button--${variant} ${props.className ?? ''}`}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy && <LoaderCircle size={18} className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
export function Field({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = props.id || props.name;
  return (
    <label className={`field ${props.className ?? ''}`} htmlFor={id}>
      <span>
        {label}
        {props.required && (
          <span className="required-marker" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </span>
      <input
        {...props}
        id={id}
        className="input"
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : props['aria-describedby']}
      />
      {error && (
        <small className="field-error" id={`${id}-error`}>
          {error}
        </small>
      )}
    </label>
  );
}
export function Notice({
  children,
  danger,
  action,
}: {
  children: ReactNode;
  danger?: boolean;
  action?: ReactNode;
}) {
  return (
    <div
      className={`notice ${danger ? 'notice--error' : ''}`}
      role={danger ? 'alert' : 'status'}
    >
      <AlertCircle size={20} aria-hidden="true" />
      <div>{children}</div>
      {action}
    </div>
  );
}
export function Loading({
  label = 'Loading your application…',
}: {
  label?: string;
}) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} />
      {label}
    </div>
  );
}
export function Stepper({ step }: { step: number }) {
  return (
    <ol className="stepper" aria-label="Application progress">
      {['Details', 'Credentials', 'Review'].map((name, index) => (
        <li
          key={name}
          className={index + 1 <= step ? 'reached' : ''}
          aria-current={index + 1 === step ? 'step' : undefined}
        >
          <span className="step-number">
            {index + 1 < step ? (
              <Check size={20} aria-hidden="true" />
            ) : (
              index + 1
            )}
          </span>
          <span>{name}</span>
          {index < 2 && <span className="step-line" />}
        </li>
      ))}
    </ol>
  );
}
export function ApplicationAside({
  application,
  kind,
  role,
  name,
  credentials,
}: {
  application?: Application;
  kind?: PartnerType;
  role?: Role;
  name?: string;
  credentials?: boolean;
}) {
  return (
    <aside className="application-aside">
      <h2>Your application</h2>
      <p>{typeNames[application?.partner_type || kind || 'practitioner']}</p>
      {(application?.practitioner_role || role) && (
        <p>{titleCase(application?.practitioner_role || role || '')}</p>
      )}
      <strong>{application?.display_name || name || 'New application'}</strong>
      <hr />
      <h2>{credentials ? 'Before you upload' : 'Save and come back'}</h2>
      <p>
        {credentials
          ? 'Use clear, current documents. Make sure names and license numbers are readable.'
          : 'You can save a draft and finish your application later. Your application is only sent for review when you submit it.'}
      </p>
      <p className="privacy-note">
        <LockKeyhole size={22} aria-hidden="true" />
        <span>
          {credentials
            ? 'Only you and authorized reviewers can access these files.'
            : 'Only you and authorized reviewers can access your application.'}
        </span>
      </p>
    </aside>
  );
}
export function ConfirmDialog({
  open,
  title,
  children,
  onCancel,
  onConfirm,
  confirm = 'Continue',
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  confirm?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <div>{children}</div>
      <div className="dialog-actions">
        <Button variant="secondary" onClick={onCancel} autoFocus>
          Cancel
        </Button>
        <Button onClick={onConfirm}>{confirm}</Button>
      </div>
    </dialog>
  );
}
