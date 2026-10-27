"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

type State = "signed_out" | "inactive" | "full" | "grace" | "locked";
type Status = { state: State; graceEndsAt: string | null; marker: string; serverNow: string };

const POLL_MS = 30_000;
const MAX_TIMEOUT_MS = 2_147_000_000; // setTimeout limit (~24.8 days)

/**
 * Keeps an open page in step with the server's access decision, without
 * waiting for the next click:
 * - when a grace period ends, or access is revoked (rejected, disabled,
 *   sessions ended), the user is signed out at once and sent to sign in;
 * - when access improves (e.g. approved), the page refreshes.
 * Timing uses the server clock; every decision is re-checked on the server.
 */
export function AccessWatcher({ initial }: { initial: State }) {
  const router = useRouter();
  const last = useRef<State>(initial);
  const lastMarker = useRef<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;

    const leave = async (reason: "access-ended" | "signed-out") => {
      if (done.current) return;
      done.current = true;
      await authClient.signOut().catch(() => undefined);
      window.location.replace(`/login?reason=${reason}`);
    };

    const check = async () => {
      if (done.current) return;
      let s: Status;
      try {
        const res = await fetch("/api/session/status", { cache: "no-store" });
        if (!res.ok) return; // transient failure: the server still enforces on every request
        s = (await res.json()) as Status;
      } catch {
        return;
      }
      const prev = last.current;
      last.current = s.state;
      if (s.state === "signed_out" || s.state === "inactive") return leave("signed-out");
      if (s.state === "locked" && prev !== "locked") return leave("access-ended");
      const markerChanged = lastMarker.current !== null && lastMarker.current !== s.marker;
      lastMarker.current = s.marker;
      if (s.state !== prev || markerChanged) router.refresh(); // e.g. approved, put on hold or rejected

      clearTimeout(expiryTimer);
      if (s.state === "grace" && s.graceEndsAt) {
        // Fire just after the end, measured on the server clock.
        const msLeft = new Date(s.graceEndsAt).getTime() - new Date(s.serverNow).getTime() + 500;
        expiryTimer = setTimeout(check, Math.min(Math.max(msLeft, 0), MAX_TIMEOUT_MS));
      }
    };

    void check();
    const poll = setInterval(check, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(poll);
      clearTimeout(expiryTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [router]);

  return null;
}
