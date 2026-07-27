import type { DownloadAuthorizationRow } from "../types";
import { newDownloadToken, sha256Hex } from "./ids";

export interface NewDownloadToken {
  rawToken: string;   // put in the URL sent to the customer — never persisted
  tokenHash: string;  // what actually gets stored in download_authorizations.token_hash
}

export async function generateDownloadToken(): Promise<NewDownloadToken> {
  const rawToken = newDownloadToken();
  const tokenHash = await sha256Hex(rawToken);
  return { rawToken, tokenHash };
}

export async function hashDownloadToken(rawToken: string): Promise<string> {
  return sha256Hex(rawToken);
}

export type DownloadAuthEvaluation =
  | "OK"
  | "NOT_FOUND"
  | "REVOKED"
  | "EXPIRED"
  | "LIMIT_REACHED";

/**
 * Pure evaluation of a download authorization's current state. Takes `now`
 * as an explicit parameter (rather than reading Date.now() internally) so
 * expiry logic is deterministically testable.
 */
export function evaluateDownloadAuthorization(
  auth: Pick<DownloadAuthorizationRow, "revoked" | "expires_at" | "download_count" | "max_downloads"> | null,
  now: Date,
): DownloadAuthEvaluation {
  if (!auth) return "NOT_FOUND";
  if (auth.revoked === 1) return "REVOKED";
  if (new Date(auth.expires_at).getTime() <= now.getTime()) return "EXPIRED";
  if (auth.download_count >= auth.max_downloads) return "LIMIT_REACHED";
  return "OK";
}

export function expiresAtFromHours(hours: number, now: Date = new Date()): string {
  return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
}
