"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { useSubmitWithoutReset, type FormState } from "@/components/form";
import { toast } from "@/components/toaster";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;

/**
 * Mark in / mark out. Location is read once, only when the button is pressed,
 * and only if the person allows it. Nothing is tracked in the background.
 */
export function MarkCard({ action, kind, showLateReason }: { action: Act; kind: "in" | "out"; showLateReason: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const onSubmit = useSubmitWithoutReset(formAction);
  const [locating, setLocating] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);
  // The saved / failed result is announced as a toast.
  useEffect(() => {
    if (state.message) toast(state.message, state.ok === false ? "error" : "success");
  }, [state]);

  function submitWithLocation() {
    const form = formRef.current;
    if (!form) return;
    if (!("geolocation" in navigator)) {
      setLocNote("Location is not available on this device; marking without it.");
      form.requestSubmit();
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
      () => {
        setLocating(false);
        setLocNote("Location permission was not given; marking without location.");
        form.requestSubmit();
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="latitude" />
      <input type="hidden" name="longitude" />
      {showLateReason && (
        <div>
          <label htmlFor="lateReason" className="mb-1 block text-sm font-medium">Reason for late arrival</label>
          <input id="lateReason" name="lateReason" className="block w-full rounded-lg border border-line px-3 py-2 text-sm transition-[border-color,box-shadow] focus:border-ink focus:outline-none focus:ring-4 focus:ring-marigold-soft" placeholder="Inform your team lead — one genuine late per month is excused" />
        </div>
      )}
      <div>
        <label htmlFor={`photo-${kind}`} className="mb-1 block text-sm font-medium">Live photo (optional)</label>
        <input id={`photo-${kind}`} name="photo" type="file" accept="image/*" capture="user" className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:transition-colors hover:file:bg-paper" />
      </div>
      <button type="button" onClick={submitWithLocation} disabled={pending || locating} className={buttonClass("primary", "md", "relative h-12 w-full px-6 text-base sm:w-auto")}>
        <span className="relative grid size-5 place-items-center">
          {(locating || pending) && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-marigold/60" />}
          <MapPin className="relative size-4" aria-hidden />
        </span>
        {locating ? "Getting location…" : pending ? "Saving…" : kind === "in" ? "Mark in" : "Mark out"}
      </button>
      <p className="text-xs text-muted">Your location is saved only at this moment, if you allow it.</p>
      <p aria-live="polite" className={locNote ? "text-sm text-warn" : "sr-only"}>{locNote}</p>
    </form>
  );
}
