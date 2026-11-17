import "server-only";

// Two-tier cache for the AI assistant.
//
//   L1  in-process LRU map: zero latency, survives between requests of one server process.
//   L2  Upstash Redis over REST (optional): survives restarts and deploys, shared by every
//       server process. Used only for data that is not private to a firm (the public Google
//       Sheet) and for rate-limit counters. Firm database results never leave the server.
//
// Free-tier friendly: one REST call per L2 miss/fill (pipelined), short timeouts, values are
// size-capped, and every Redis failure silently falls back to L1 so the chat never waits on it.

type Entry = { value: unknown; storedAt: number; expiresAt: number };

const L1_MAX = 300;
const l1 = new Map<string, Entry>();

function l1Get(key: string): Entry | null {
  const e = l1.get(key);
  if (!e) return null;
  if (e.expiresAt < Date.now()) {
    l1.delete(key);
    return null;
  }
  l1.delete(key); // move to the newest position (LRU)
  l1.set(key, e);
  return e;
}

function l1Set(key: string, value: unknown, ttlSeconds: number, storedAt = Date.now()) {
  l1.set(key, { value, storedAt, expiresAt: Date.now() + ttlSeconds * 1000 });
  while (l1.size > L1_MAX) l1.delete(l1.keys().next().value!);
}

// ---------------------------------------------------------------- Upstash REST

const PREFIX = "ssd:ai:";
const MAX_L2_BYTES = 900_000; // stay well under Upstash's 1 MB request limit on the free tier

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

let redisDownUntil = 0; // circuit breaker: after a failure, skip Redis for 30 s

/** Runs commands in one round trip. Returns null when Redis is not configured or unreachable. */
export async function redis(commands: (string | number)[][], timeoutMs = 1200): Promise<unknown[] | null> {
  const cfg = redisConfig();
  if (!cfg || Date.now() < redisDownUntil) return null;
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`redis ${res.status}`);
    const out = (await res.json()) as { result?: unknown; error?: string }[];
    return out.map((r) => (r.error ? null : r.result));
  } catch {
    redisDownUntil = Date.now() + 30_000;
    return null;
  }
}

type Stored = { v: unknown; t: number };

/**
 * Stale-while-revalidate read. Returns the cached value (and its age) from L1, else L2.
 * `maxStaleSeconds` bounds how old a value may be and still be returned at all.
 */
export async function cacheGet<T>(key: string, opts: { shared: boolean; maxStaleSeconds: number }): Promise<{ value: T; ageSeconds: number } | null> {
  const hit = l1Get(key);
  if (hit) return { value: hit.value as T, ageSeconds: (Date.now() - hit.storedAt) / 1000 };
  if (!opts.shared) return null;
  const r = await redis([["GET", PREFIX + key]]);
  const raw = r?.[0];
  if (typeof raw !== "string") return null;
  try {
    const s = JSON.parse(raw) as Stored;
    const age = (Date.now() - s.t) / 1000;
    if (age > opts.maxStaleSeconds) return null;
    l1Set(key, s.v, Math.max(1, opts.maxStaleSeconds - age), s.t);
    return { value: s.v as T, ageSeconds: age };
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, opts: { shared: boolean; ttlSeconds: number }) {
  l1Set(key, value, opts.ttlSeconds);
  if (!opts.shared) return;
  const body = JSON.stringify({ v: value, t: Date.now() } satisfies Stored);
  if (body.length > MAX_L2_BYTES) return;
  await redis([["SET", PREFIX + key, body, "EX", opts.ttlSeconds]]);
}

/** Single-flight: concurrent callers for the same key share one in-flight load. */
const inflight = new Map<string, Promise<unknown>>();
export function singleFlight<T>(key: string, load: () => Promise<T>): Promise<T> {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = load().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ---------------------------------------------------------------- rate limit

const localHits = new Map<string, { count: number; resetAt: number }>();

/**
 * Fixed-window limiter per key. Uses Redis (INCR + EXPIRE NX in one round trip) so limits hold
 * across server restarts and processes; falls back to memory when Redis is unavailable.
 */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const k = `${PREFIX}rl:${key}:${window}`;
  const r = await redis([["INCR", k], ["EXPIRE", k, windowSeconds + 5, "NX"]], 800);
  if (r && typeof r[0] === "number") return r[0] <= max;
  const now = Date.now();
  const b = localHits.get(k);
  if (!b || b.resetAt < now) {
    localHits.set(k, { count: 1, resetAt: now + windowSeconds * 1000 });
    if (localHits.size > 5000) for (const [kk, v] of localHits) if (v.resetAt < now) localHits.delete(kk);
    return true;
  }
  b.count++;
  return b.count <= max;
}
