// Runs once when the Next.js server starts.
//
// Careers (28 Nov 2026): candidates' replies are read from the mailbox every two minutes, so they
// are in the ERP even when nobody has it open. The server calls its own cron route (which needs
// CRON_SECRET) rather than importing the mailbox code here, so the page code stays in one bundle.
// Off when CAREERS_MAILBOX=off; not during `next build`.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24 || (process.env.CAREERS_MAILBOX ?? "").toLowerCase() === "off") return;
  const port = process.env.PORT || "3000";
  const tick = () =>
    fetch(`http://127.0.0.1:${port}/api/cron/careers-mail`, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(110_000) })
      .then((r) => r.body?.cancel())
      .catch(() => undefined);
  setTimeout(tick, 30_000);
  setInterval(tick, 120_000).unref?.();
}
