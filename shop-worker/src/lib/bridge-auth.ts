// Machine-to-machine authentication for the House of Assets bridge.
//
// This is deliberately NOT the Cloudflare Access path used by /shop/admin/*.
// Access authenticates a *person* in a browser and issues a JWT for that
// session; House of Assets is a system with no browser and no human at the
// keyboard, so it presents a shared bearer secret instead.
//
// The two must not be confused. The bridge routes live outside /shop/admin/
// precisely so that holding this token never grants any Admin capability:
// it can hand the Shop a governed publication and nothing else.

import type { Env } from "../types";

/**
 * Compares two strings without leaking, through timing, how much of the
 * candidate was correct. Same technique as the Stripe signature check.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export type BridgeAuthResult = "OK" | "UNAUTHENTICATED" | "NOT_CONFIGURED";

/**
 * Checks the `Authorization: Bearer …` header against the configured bridge
 * token.
 *
 * Fails closed on every uncertainty: no header, a malformed header, a token
 * that does not match, or a deployment where the secret has not been uploaded
 * at all. An unset secret must never mean "accept anything" — that is the
 * failure mode that turns an internal bridge into a public publishing
 * endpoint.
 */
export function checkBridgeToken(request: Request, env: Env): BridgeAuthResult {
  const expected = env.HOA_PUBLICATION_BRIDGE_TOKEN?.trim();
  if (!expected || expected.length < 16 || expected.startsWith("REPLACE_WITH")) {
    return "NOT_CONFIGURED";
  }

  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return "UNAUTHENTICATED";

  return constantTimeEqual(match[1].trim(), expected) ? "OK" : "UNAUTHENTICATED";
}
