import { describe, expect, it } from "vitest";
import { evaluateDownloadAuthorization, expiresAtFromHours, generateDownloadToken, hashDownloadToken } from "../src/lib/download-auth";
import type { DownloadAuthorizationRow } from "../src/types";

function auth(overrides: Partial<DownloadAuthorizationRow> = {}): Pick<
  DownloadAuthorizationRow,
  "revoked" | "expires_at" | "download_count" | "max_downloads"
> {
  return {
    revoked: 0,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    download_count: 0,
    max_downloads: 5,
    ...overrides,
  };
}

describe("generateDownloadToken / hashDownloadToken", () => {
  it("produces a high-entropy raw token whose hash matches independent re-hashing", async () => {
    const { rawToken, tokenHash } = await generateDownloadToken();
    expect(rawToken).toHaveLength(64); // 32 bytes hex-encoded
    expect(tokenHash).toBe(await hashDownloadToken(rawToken));
  });

  it("never stores the raw token — hash differs from the raw value", async () => {
    const { rawToken, tokenHash } = await generateDownloadToken();
    expect(tokenHash).not.toBe(rawToken);
  });

  it("produces different tokens on each call", async () => {
    const a = await generateDownloadToken();
    const b = await generateDownloadToken();
    expect(a.rawToken).not.toBe(b.rawToken);
  });
});

describe("evaluateDownloadAuthorization", () => {
  const now = new Date("2026-07-27T12:00:00.000Z");

  it("returns NOT_FOUND for a null authorization", () => {
    expect(evaluateDownloadAuthorization(null, now)).toBe("NOT_FOUND");
  });

  it("returns OK for a fresh, unexpired, unused authorization", () => {
    expect(evaluateDownloadAuthorization(auth(), now)).toBe("OK");
  });

  it("rejects a revoked authorization — even if otherwise valid", () => {
    expect(evaluateDownloadAuthorization(auth({ revoked: 1 }), now)).toBe("REVOKED");
  });

  it("rejects an expired link", () => {
    const expired = auth({ expires_at: "2026-07-24T00:00:00.000Z" }); // 72h before `now`
    expect(evaluateDownloadAuthorization(expired, now)).toBe("EXPIRED");
  });

  it("treats an authorization expiring at exactly `now` as expired", () => {
    const exact = auth({ expires_at: now.toISOString() });
    expect(evaluateDownloadAuthorization(exact, now)).toBe("EXPIRED");
  });

  it("rejects once download_count reaches max_downloads", () => {
    const maxed = auth({ download_count: 5, max_downloads: 5 });
    expect(evaluateDownloadAuthorization(maxed, now)).toBe("LIMIT_REACHED");
  });

  it("allows a download when count is below the limit", () => {
    const almostMaxed = auth({ download_count: 4, max_downloads: 5 });
    expect(evaluateDownloadAuthorization(almostMaxed, now)).toBe("OK");
  });

  it("checks revoked before expiry before limit (priority order)", () => {
    const everythingWrong = auth({ revoked: 1, expires_at: "2020-01-01T00:00:00.000Z", download_count: 10, max_downloads: 5 });
    expect(evaluateDownloadAuthorization(everythingWrong, now)).toBe("REVOKED");
  });
});

describe("expiresAtFromHours", () => {
  it("computes an ISO timestamp N hours in the future", () => {
    const now = new Date("2026-07-27T00:00:00.000Z");
    const result = expiresAtFromHours(72, now);
    expect(result).toBe("2026-07-30T00:00:00.000Z");
  });
});
