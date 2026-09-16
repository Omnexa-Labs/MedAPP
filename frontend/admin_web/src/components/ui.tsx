'use client';
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { LoaderCircle, AlertCircle } from 'lucide-react';
import { titleCase } from '@/lib/types';
export function Button({
  busy,
  variant = 'primary',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}) {
  return (
    <button
      type="button"
      {...props}
      className={`button button--${variant} ${props.className || ''}`}
      disabled={busy || props.disabled}
      aria-busy={busy || undefined}
    >
      {busy && <LoaderCircle aria-hidden="true" size={18} className="spin" />}
      {children}
    </button>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? 'notice--error' : ''}`}
      role={error ? 'alert' : 'status'}
    >
      <AlertCircle size={20} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
export function Loading({
  children = 'Loading applications…',
}: {
  children?: ReactNode;
}) {
  return (
    <p className="loading" role="status">
      <LoaderCircle size={22} className="spin" aria-hidden="true" />
      {children}
    </p>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span className={`status status--${value}`}>
      <span aria-hidden="true" />
      {titleCase(value)}
    </span>
  );
}
export function ConfirmDialog({
  open,
  title,
  children,
  busy,
  onCancel,
  onConfirm,
  action,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  action: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const label = useId();
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={label}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id={label}>{title}</h2>
      <div>{children}</div>
      <div className="dialog-actions">
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button busy={busy} onClick={onConfirm}>
          {action}
        </Button>
      </div>
    </dialog>
  );
}
