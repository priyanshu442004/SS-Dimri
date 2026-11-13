"use client";

import { createContext, useActionState, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { Camera, LogIn, LogOut, MapPin, Navigation, UtensilsCrossed } from "lucide-react";
import { clsx } from "clsx";
import { buttonClass } from "@/components/ui";
import { ActionForm, ErrorsContext, SelectField, SubmitButton, TextArea, TextField, useSubmitWithoutReset, type FormState } from "@/components/form";
import { SearchSelect } from "@/components/pickers";
import { toast } from "@/components/toaster";
import { t } from "@/lib/i18n";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Option = { value: string; label: string };

/**
 * A form whose buttons first read the device location once (if allowed), then submit.
 * Nothing is tracked in the background. `submit` sets extra fields (e.g. kind) on the way.
 */
type GeoApi = { busy: boolean; locating: boolean; submit: (extra?: Record<string, string>) => void };
const GeoContext = createContext<GeoApi>({ busy: false, locating: false, submit: () => undefined });
const useGeo = () => useContext(GeoContext);

function GeoForm({ action, children, resetOnSuccess, className, onSuccess }: {
  action: Act;
  onSuccess?: () => void;
  children: ReactNode;
  resetOnSuccess?: boolean;
  className?: string;
}) {
  // The result is announced here, not in an effect: a button such as "Check out from client"
  // disappears as soon as the page updates, and its message must still be shown.
  const [state, formAction, pending] = useActionState(async (prev: FormState, fd: FormData): Promise<FormState> => {
    let r: FormState;
    try {
      r = await action(prev, fd);
    } catch (e) {
      unstable_rethrow(e);
      r = { ok: false, message: "Could not save. Please try again, or reload the page if it keeps happening." };
    }
    if (r.message) toast(r.message, r.ok === false ? "error" : "success");
    else if (r.ok === false && r.fieldErrors) toast("Please check the highlighted fields.", "error");
    return r;
  }, {});
  const ref = useRef<HTMLFormElement>(null);
  const onSubmit = useSubmitWithoutReset(formAction);
  const [locating, setLocating] = useState(false);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
    if (state.ok) onSuccess?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per result only
  }, [state, resetOnSuccess]);

  function submit(extra: Record<string, string> = {}) {
    const form = ref.current;
    if (!form) return;
    for (const [k, v] of Object.entries(extra)) {
      let input = form.querySelector<HTMLInputElement>(`input[type=hidden][data-extra="${k}"]`);
      if (!input) {
        input = document.createElement("input");
        input.type = "hidden";
        input.name = k;
        input.dataset.extra = k;
        form.appendChild(input);
      }
      input.value = v;
    }
    const lat = form.elements.namedItem("latitude") as HTMLInputElement;
    const lng = form.elements.namedItem("longitude") as HTMLInputElement;
    if (!("geolocation" in navigator)) return form.requestSubmit();
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lat.value = pos.coords.latitude.toFixed(6);
        lng.value = pos.coords.longitude.toFixed(6);
        setLocating(false);
        form.requestSubmit();
      },
      () => {
        lat.value = "";
        lng.value = "";
        setLocating(false);
        form.requestSubmit();
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  return (
    <form ref={ref} onSubmit={onSubmit} noValidate className={clsx("space-y-3", className)}>
      <input type="hidden" name="latitude" />
      <input type="hidden" name="longitude" />
      <ErrorsContext.Provider value={state.fieldErrors}>
        <GeoContext.Provider value={{ busy: pending || locating, locating, submit }}>{children}</GeoContext.Provider>
      </ErrorsContext.Provider>
    </form>
  );
}

const spinner = <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />;

// ---------------------------------------------------------------- mark for others

export type ProxyTarget = { value: string; label: string; group: "Team member" | "Daily worker"; state: "none" | "in" | "out" | "other"; status: string };

/**
 * A senior marks a colleague or a daily worker: choose the person, take their photo, record
 * the time in or out. The button offers whichever is next for that person today.
 */
export function ProxyMarkForm({ action, targets }: { action: Act; targets: ProxyTarget[] }) {
  const [person, setPerson] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const target = targets.find((t) => t.value === person);
  const options = useMemo(() => targets.map((t) => ({ value: t.value, label: `${t.label} · ${t.group}` })), [targets]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const next = target?.state === "in" ? "out" : "in";
  return (
    <GeoForm action={action} resetOnSuccess onSuccess={() => { setPerson(""); setPreview(null); }}>
          <SearchSelect label="Person" name="person" required options={options} value={person} onChange={setPerson} placeholder="Type the name…" />
          {target && (
            <p className={clsx("rounded-lg px-3 py-2 text-sm", target.state === "out" || target.state === "other" ? "bg-warn-bg text-warn" : "bg-subtle text-ink")}>
              <strong>{target.label.split(" — ")[0]}</strong>: {target.status}
            </p>
          )}
          <div>
            <label htmlFor="proxy-photo" className="mb-1 block text-sm font-medium">Photo of the person <span className="text-danger">*</span></label>
            <label htmlFor="proxy-photo" className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-ink/25 bg-paper p-3 transition-colors hover:border-ink/50">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Photo taken" className="size-20 rounded-lg object-cover" />
              ) : (
                <span className="grid size-20 place-items-center rounded-lg bg-subtle text-muted"><Camera className="size-7" aria-hidden /></span>
              )}
              <span className="text-sm">
                <span className="font-medium">{preview ? "Retake photo" : "Take photo"}</span>
                <span className="block text-xs text-muted">The camera opens on a phone. The face should be clearly visible: this is the proof of attendance.</span>
              </span>
            </label>
            <input
              id="proxy-photo"
              name="photo"
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setPreview((old) => { if (old) URL.revokeObjectURL(old); return f ? URL.createObjectURL(f) : null; });
              }}
            />
          </div>
          <TextField label="Note (optional)" name="note" placeholder="e.g. Phone battery dead" />
          <ProxySubmit next={next} disabled={!person || target?.state === "out" || target?.state === "other"} hasPhoto={!!preview} />
          <p className="text-xs text-muted">Your location is saved with the photo, only at this moment, if you allow it. The time comes from the server.</p>
    </GeoForm>
  );
}

function ProxySubmit({ next, disabled, hasPhoto }: { next: "in" | "out"; disabled: boolean; hasPhoto: boolean }) {
  const { busy, locating, submit } = useGeo();
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={busy || disabled}
        onClick={() => {
          if (!hasPhoto) { toast("Take a photo of the person first.", "error"); return; }
          submit({ kind: next });
        }}
        className={buttonClass("primary", "md", "h-12 px-6 text-base")}
      >
        {busy ? spinner : next === "in" ? <LogIn className="size-4" aria-hidden /> : <LogOut className="size-4" aria-hidden />}
        {locating ? "Getting location…" : busy ? "Saving…" : next === "in" ? "Record time in" : "Record time out"}
      </button>
    </div>
  );
}

function GeoSubmit({ label, variant = "primary", size = "md", icon }: { label: string; variant?: "primary" | "secondary"; size?: "sm" | "md"; icon: ReactNode }) {
  const { busy, locating, submit } = useGeo();
  return (
    <button type="button" disabled={busy} onClick={() => submit()} className={buttonClass(variant, size)}>
      {busy ? spinner : icon}
      {locating ? "Getting location…" : busy ? "Saving…" : label}
    </button>
  );
}

// ---------------------------------------------------------------- lunch

/** The result is announced straight from the action: the button is replaced as soon as the page updates. */
export function LunchButton({ action, kind }: { action: Act; kind: "out" | "in" }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      className={buttonClass(kind === "out" ? "secondary" : "primary", "md")}
      onClick={() =>
        start(async () => {
          try {
            const r = await action({}, new FormData());
            toast(r.message ?? "Saved.", r.ok === false ? "error" : "success");
          } catch {
            toast("Could not save. Please try again, or reload the page if it keeps happening.", "error");
          }
        })
      }
    >
      {pending ? spinner : <UtensilsCrossed className="size-4" aria-hidden />}
      {kind === "out" ? "Start lunch" : "Back from lunch"}
    </button>
  );
}

// ---------------------------------------------------------------- client visits

export function VisitStartForm({ action, clients, atClient }: { action: Act; clients: Option[]; atClient: boolean }) {
  const [clientId, setClientId] = useState("");
  return (
    <GeoForm action={action} resetOnSuccess onSuccess={() => setClientId("")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <SearchSelect label="Client" name="clientId" options={clients} value={clientId} onChange={setClientId} placeholder="Type the client's name…" />
            <TextField label="Or another place" name="placeName" placeholder="e.g. Bank, GST office" hint="Only when it is not a client." />
          </div>
          <TextField label="Purpose (optional)" name="purpose" placeholder="e.g. Stock audit, collect documents" />
          <GeoSubmit label={atClient ? "Move to next client" : "Check in at client"} icon={<Navigation className="size-4" aria-hidden />} />
    </GeoForm>
  );
}

export function VisitEndForm({ action }: { action: Act }) {
  return (
    <GeoForm action={action}>
      <GeoSubmit label="Check out from client" variant="secondary" size="sm" icon={<MapPin className="size-3.5" aria-hidden />} />
    </GeoForm>
  );
}

// ---------------------------------------------------------------- photo check

/**
 * Accept / mark absent. The result is announced straight from the action (not from an effect):
 * a decided card leaves the "To check" list at once, and the message must still be shown.
 */
export function PhotoReviewForm({ action, decided }: { action: Act; decided: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  function decide(decision: "accept" | "reject") {
    const form = ref.current;
    if (!form) return;
    const fd = new FormData(form);
    if (decision === "reject") {
      if (!String(fd.get("note") ?? "").trim()) { toast("Say why the photo is not genuine.", "error"); return; }
      if (!window.confirm(t("Mark this person absent for the day?"))) return;
    }
    fd.set("decision", decision);
    start(async () => {
      try {
        const r = await action({}, fd);
        toast(r.message ?? (r.ok ? "Saved." : "That didn't work. Please try again."), r.ok === false ? "error" : "success");
      } catch {
        toast("Could not save. Please try again, or reload the page if it keeps happening.", "error");
      }
    });
  }
  return (
    <form ref={ref} onSubmit={(e) => e.preventDefault()} className="space-y-3" noValidate>
      <TextArea label={decided ? "Note (change the decision)" : "Note (needed to mark absent)"} name="note" rows={2} placeholder="e.g. Face not visible, photo of a photo" />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => decide("accept")} className={buttonClass("primary", "sm")}>
          {pending && spinner}Looks genuine
        </button>
        <button type="button" disabled={pending} onClick={() => decide("reject")} className={buttonClass("danger", "sm")}>
          {pending && spinner}Not genuine – mark absent
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- daily workers

type WorkerValues = { name?: string; mobile?: string | null; workType?: string | null; contractor?: string | null; dailyWage?: string; remarks?: string | null };

export function WorkerForm({ action, d, submitLabel }: { action: Act; d?: WorkerValues; submitLabel: string }) {
  return (
    <ActionForm action={action} resetOnSuccess={!d}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Name" name="name" required defaultValue={d?.name} />
        <TextField label="Daily wage (₹)" name="dailyWage" type="number" min={0} step="0.01" inputMode="decimal" required defaultValue={d?.dailyWage} />
        <TextField label="Mobile" name="mobile" type="tel" defaultValue={d?.mobile ?? ""} />
        <TextField label="Kind of work" name="workType" placeholder="e.g. Labour, Helper, Mason" defaultValue={d?.workType ?? ""} />
        <TextField label="Contractor / agency" name="contractor" defaultValue={d?.contractor ?? ""} />
        <TextField label="Remarks" name="remarks" defaultValue={d?.remarks ?? ""} />
      </div>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}

export function WorkerDayForm({ action, workers, date }: { action: Act; workers: Option[]; date: string }) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-3 sm:grid-cols-3">
        <SearchSelect label="Worker" name="workerId" required options={workers} />
        <TextField label="Date" name="date" type="date" required defaultValue={date} />
        <SelectField label="Status" name="status" required placeholder={null} defaultValue="PRESENT" options={[
          { value: "PRESENT", label: "Present (full wage)" }, { value: "HALF_DAY", label: "Half day (half wage)" }, { value: "ABSENT", label: "Absent (no wage)" },
        ]} />
        <TextField label="Time in" name="timeIn" type="time" />
        <TextField label="Time out" name="timeOut" type="time" />
        <TextField label="Remarks" name="remarks" />
      </div>
      <SubmitButton>Save day</SubmitButton>
    </ActionForm>
  );
}
