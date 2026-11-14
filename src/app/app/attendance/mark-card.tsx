"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { inputCls, useSubmitWithoutReset, type FormState } from "@/components/form";
import { toast } from "@/components/toaster";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Location = "OFFICE" | "CLIENT_OFFICE" | "CLIENT_VISIT";

/**
 * Mark in / mark out (office rules 1–2). The map location is required: without it the button
 * explains how to allow it instead of marking. The work location (office / client office /
 * client visit) is recorded with the time. Location is read once, only when the button is pressed.
 */
export function MarkCard({ action, kind, showLateReason, labels, clients, defaultLocation, defaultPlace, warning }: {
  action: Act;
  kind: "in" | "out";
  showLateReason: boolean;
  labels: Record<Location, string>;
  clients: string[];
  defaultLocation?: Location | null;
  defaultPlace?: string | null;
  /** Shown above the button, e.g. "Leaving before 17:30 counts as a half day". */
  warning?: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const onSubmit = useSubmitWithoutReset(formAction);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [where, setWhere] = useState<Location | "">(defaultLocation ?? (kind === "in" ? "" : "OFFICE"));
  const id = useId();
  // The saved / failed result is announced as a toast.
  useEffect(() => {
    if (state.message) toast(state.message, state.ok === false ? "error" : "success");
  }, [state]);

  function submitWithLocation() {
    const form = formRef.current;
    if (!form) return;
    setLocError(null);
    if (!where) {
      setLocError("Choose where you are working today.");
      return;
    }
    if (where !== "OFFICE" && !(form.elements.namedItem("workPlace") as HTMLInputElement).value.trim()) {
      setLocError(where === "CLIENT_OFFICE" ? "Enter the client whose office you are at." : "Enter the client you are visiting.");
      return;
    }
    if (!("geolocation" in navigator)) {
      setLocError("This device or browser cannot share its location, and attendance needs the map location. Use your phone's browser instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        (form.elements.namedItem("latitude") as HTMLInputElement).value = pos.coords.latitude.toFixed(6);
        (form.elements.namedItem("longitude") as HTMLInputElement).value = pos.coords.longitude.toFixed(6);
        setLocating(false);
        form.requestSubmit();
      },
      (err) => {
        setLocating(false);
        setLocError(
          err.code === err.PERMISSION_DENIED
            ? "Location is blocked for this site. Allow it (tap the lock or ⓘ icon next to the address, then Location → Allow) and press the button again. Attendance without the map location is not considered."
            : "Your location could not be found. Turn on location (GPS) on your phone, move near a window if indoors, and try again.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="latitude" />
      <input type="hidden" name="longitude" />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{kind === "in" ? "Where are you working today?" : "Where are you marking out?"}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(labels) as Location[]).map((k) => (
            <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${where === k ? "border-ink bg-paper font-medium" : "border-line hover:border-ink/30"}`}>
              <input type="radio" name="workLocation" value={k} checked={where === k} onChange={() => setWhere(k)} className="accent-ink" />
              {labels[k]}
            </label>
          ))}
        </div>
      </fieldset>
      {where && where !== "OFFICE" && (
        <div>
          <label htmlFor={`${id}-place`} className="mb-1 block text-sm font-medium">{where === "CLIENT_OFFICE" ? "Client office" : "Client you are visiting"}</label>
          <input id={`${id}-place`} name="workPlace" list={`${id}-clients`} defaultValue={defaultPlace ?? ""} className={inputCls} placeholder="Start typing the client's name" autoComplete="off" />
          <datalist id={`${id}-clients`}>{clients.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
      )}
      {showLateReason && (
        <div>
          <label htmlFor={`${id}-late`} className="mb-1 block text-sm font-medium">Reason for late arrival</label>
          <input id={`${id}-late`} name="lateReason" className={inputCls} placeholder="Shown to your Team Lead" />
        </div>
      )}
      <div>
        <label htmlFor={`${id}-photo`} className="mb-1 block text-sm font-medium">Live photo (optional)</label>
        <input id={`${id}-photo`} name="photo" type="file" accept="image/*" capture="user" className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:transition-colors hover:file:bg-paper" />
      </div>
      {warning && <p className="rounded-lg border border-marigold/40 bg-warn-bg px-3 py-2 text-sm text-warn">{warning}</p>}
      <button type="button" onClick={submitWithLocation} disabled={pending || locating} className={buttonClass("primary", "md", "relative h-12 w-full px-6 text-base sm:w-auto")}>
        <span className="relative grid size-5 place-items-center">
          {(locating || pending) && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-marigold/60" />}
          <MapPin className="relative size-4" aria-hidden />
        </span>
        {locating ? "Getting location…" : pending ? "Saving…" : kind === "in" ? "Mark in" : "Mark out"}
      </button>
      <p className="text-xs text-muted">Your map location is required and saved only at this moment. Nothing is tracked in the background.</p>
      <p role="alert" aria-live="assertive" className={locError ? "rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger" : "sr-only"}>{locError}</p>
    </form>
  );
}
