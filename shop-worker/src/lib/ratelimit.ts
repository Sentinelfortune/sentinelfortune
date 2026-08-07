// Best-effort, per-isolate fixed-window rate limiter.
//
// KNOWN LIMITATION (documented in SHOP_KNOWN_LIMITATIONS.md): Cloudflare
// Workers run many concurrent isolates with no shared memory, so this limiter
// only bounds request volume *per isolate*, not globally. It is deliberately
// simple — a Map that lives as long as the isolate stays warm — so it adds
// zero infrastructure (no Durable Object, no KV namespace) for the MVP.
// It is a second layer, not the primary control: the primary, authoritative
// rate limit must be configured as a Cloudflare Rate Limiting Rule on the
// zone/route (see CLOUDFLARE_SHOP_SETUP.md). Do not remove this in-Worker
// layer when the dashboard rule is added — keep both.

interface Bucket {
  count: number;
  windowStartMs: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * @param key        Stable identifier for the caller (e.g. hashed IP + route).
 * @param limit      Max requests allowed within the window.
 * @param windowMs   Window size in milliseconds.
 * @param nowMs      Injected clock (defaults to Date.now()) for deterministic tests.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  nowMs: number = Date.now(),
): RateLimitResult {
  const existing = buckets.get(key);

  if (!existing || nowMs - existing.windowStartMs >= windowMs) {
    buckets.set(key, { count: 1, windowStartMs: nowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count };
}

/** Test-only: clears all buckets between test cases. */
export function __resetRateLimitBucketsForTests(): void {
  buckets.clear();
}

export async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}
