"use client";

import { createContext, useActionState, useContext, useEffect, useId, useRef, useTransition, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { clsx } from "clsx";
import { Copy } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { toast } from "@/components/toaster";

// Forms post to server actions. Validation runs on the server (Zod); this
// layer only displays the returned field errors and status message.

export type FormState = { ok?: boolean; message?: string; fieldErrors?: Record<string, string[] | undefined> };
type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

const ErrorsContext = createContext<FormState["fieldErrors"]>(undefined);
const PendingContext = createContext(false);

/**
 * Submit via onSubmit + a transition instead of the `action` prop: React 19
 * resets uncontrolled fields after every `action` submission, which would wipe
 * what the user typed whenever the server returns a validation error. The
 * clicked button is passed as the FormData submitter so its name/value is sent.
 */
export function useSubmitWithoutReset(formAction: (fd: FormData) => void) {
  const [, startTransition] = useTransition();
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(fd));
  };
}

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  successMessage,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  successMessage?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  const onSubmit = useSubmitWithoutReset(formAction);
  // A message carrying a one-time link must not disappear: it stays in the form with a copy button.
  const link = state.ok && state.message && LINK_RE.test(state.message) ? state.message : null;
  // Every other result (success or failure) is announced as a toast; field errors stay inline.
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
    const message = state.message ?? (state.ok ? successMessage : undefined);
    if (state.ok && message && LINK_RE.test(message)) toast("Secure link created. Copy it from the box below and share it privately.", "success");
    else if (message) toast(message, state.ok === false ? "error" : "success");
    else if (state.ok === false && state.fieldErrors) toast("Please check the highlighted fields.", "error");
  }, [state, resetOnSuccess, successMessage]);
  return (
    <form ref={ref} onSubmit={onSubmit} className={clsx("space-y-4", className)} noValidate>
      <PendingContext.Provider value={pending}>
        <ErrorsContext.Provider value={state.fieldErrors}>{children}</ErrorsContext.Provider>
      </PendingContext.Provider>
      {link && <LinkPanel message={link} />}
    </form>
  );
}

const LINK_RE = /https?:\/\/\S+/;

/** Persistent box for a message containing a one-time link, with a copy button. */
function LinkPanel({ message }: { message: string }) {
  const url = LINK_RE.exec(message)?.[0] ?? "";
  return (
    <div role="status" className="app-rise rounded-xl border border-ok/30 bg-ok-bg p-3 text-sm text-ok">
      <p className="break-all">{message}</p>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(url).then(() => toast("Link copied to the clipboard.", "info"), () => toast("Couldn't copy automatically. Select the link and copy it.", "warning"))}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-ok/40 bg-surface px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-ink/40 active:scale-95"
      >
        <Copy className="size-3.5" aria-hidden /> Copy link
      </button>
    </div>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  confirm,
  name,
  value,
  size = "md",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  confirm?: string;
  name?: string;
  value?: string;
  size?: "sm" | "md";
}) {
  const pending = useContext(PendingContext);
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-busy={pending}
      className={buttonClass(variant, size)}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? <><span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> Saving…</> : children}
    </button>
  );
}

const inputCls =
  "block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 transition-[border-color,box-shadow] duration-200 hover:border-ink/25 focus:border-ink focus:outline-none focus:ring-4 focus:ring-marigold-soft aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger-bg";

function useFieldError(name: string) {
  const errors = useContext(ErrorsContext);
  return errors?.[name]?.[0];
}

type FieldBase = { label: string; name: string; hint?: string; required?: boolean; className?: string };

function FieldShell({ label, id, hint, required, className, children, error }: Omit<FieldBase, "name"> & { id: string; children: ReactNode; error?: string }) {
  return (
    <div className={clsx("min-w-0", className)}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-danger" aria-hidden> *</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="app-rise mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function TextField({ label, name, hint, required, className, ...props }: FieldBase & Omit<ComponentProps<"input">, "name">) {
  const error = useFieldError(name);
  const id = `${name}-${useId()}`;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <FieldShell {...{ label, id, hint, required, className, error }}>
      <input
        id={id}
        name={name}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        aria-required={required}
        className={inputCls}
        {...props}
      />
    </FieldShell>
  );
}

export function TextArea({ label, name, hint, required, className, rows = 3, ...props }: FieldBase & Omit<ComponentProps<"textarea">, "name">) {
  const error = useFieldError(name);
  const id = `${name}-${useId()}`;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <FieldShell {...{ label, id, hint, required, className, error }}>
      <textarea id={id} name={name} rows={rows} aria-invalid={!!error} aria-describedby={describedBy} aria-required={required} className={inputCls} {...props} />
    </FieldShell>
  );
}

export function SelectField({
  label,
  name,
  hint,
  required,
  className,
  options,
  placeholder = "Select…",
  ...props
}: FieldBase & Omit<ComponentProps<"select">, "name"> & { options: { value: string; label: string }[]; placeholder?: string | null }) {
  const error = useFieldError(name);
  const id = `${name}-${useId()}`;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <FieldShell {...{ label, id, hint, required, className, error }}>
      <select id={id} name={name} aria-invalid={!!error} aria-describedby={describedBy} aria-required={required} className={inputCls} {...props}>
        {placeholder !== null && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function Checkbox({ label, name, defaultChecked, value }: { label: string; name: string; defaultChecked?: boolean; value?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm text-ink">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="mt-0.5 size-4 accent-ink" />
      <span>{label}</span>
    </label>
  );
}

export function FormError({ name }: { name: string }) {
  const error = useFieldError(name);
  return error ? <p className="text-xs text-danger">{error}</p> : null;
}
