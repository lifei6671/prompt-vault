import type { ReactNode } from "react";

export function AdminSubmitButton({ pending, pendingLabel, disabled, className, form, children }: {
  pending: boolean; pendingLabel: string; disabled?: boolean; className: string;
  form?: string; children: ReactNode;
}) {
  return <button type="submit" className={className} form={form} disabled={disabled || pending}
    aria-busy={pending || undefined}>
    {pending && <span className="admin-button-spinner" aria-hidden="true" />}
    {pending ? pendingLabel : children}
  </button>;
}
