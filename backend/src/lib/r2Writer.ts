/**
 * R2 Writer — Sentinel Fortune Ecosystem Logging.
 *
 * Writes traffic and sales log entries to:
 *   originus/logs/traffic/{timestamp}_{domain}.json
 *   originus/logs/sales/{timestamp}_{tier}.json
 *
 * Non-blocking by design — callers should not await if they need fire-and-forget.
 * Uses the same R2 credentials as r2Reader.ts.
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = process.env["CF_R2_BUCKET"] ?? "originus-infinity-vault";

function buildClient(): S3Client | null {
  const accountId = process.env["CF_ACCOUNT_ID"]?.trim();
  const accessKey = process.env["CF_R2_ACCESS_KEY_ID"]?.trim();
  const secretKey = process.env["CF_R2_SECRET_ACCESS_KEY"]?.trim();
  if (!accountId || !accessKey || !secretKey) return null;
  return new S3Client({
    endpoint:       `https://${accountId}.r2.cloudflarestorage.com`,
    region:         "auto",
    credentials:    { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: false,
  });
}

function nowTs(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}


// ---------------------------------------------------------------------------
// Generic write
// ---------------------------------------------------------------------------

export async function writeR2(key: string, data: Record<string, unknown>): Promise<boolean> {
  const client = buildClient();
  if (!client) return false;
  try {
    await client.send(new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         key,
      Body:        JSON.stringify(data, null, 2),
      ContentType: "application/json",
    }));
    return true;
  } catch (e) {
    console.error("[r2Writer] write error:", (e as Error).message, "key:", key);
    return false;
  }
}


// ---------------------------------------------------------------------------
// Generic read (for status lookups)
// ---------------------------------------------------------------------------

export async function readR2<T = Record<string, unknown>>(key: string): Promise<T | null> {
  const client = buildClient();
  if (!client) return null;
  try {
    const res  = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const body = await res.Body?.transformToString();
    return body ? (JSON.parse(body) as T) : null;
  } catch {
    return null;
  }
}


// ---------------------------------------------------------------------------
// Traffic log — originus/logs/traffic/{ts}_{domain}.json
// ---------------------------------------------------------------------------

export interface TrafficEntry {
  domain:     string;
  slug:       string;
  action:     string;   // "enter" | "buy" | "status"
  tier?:      string;
  ip?:        string;
  ref?:       string;
  timestamp:  string;
  source:     "cloudflare_worker" | "direct_api" | "unknown";
}

export async function logTraffic(entry: TrafficEntry): Promise<boolean> {
  const safe_domain = entry.domain.replace(/[^a-zA-Z0-9.-]/g, "_");
  const key = `originus/logs/traffic/${nowTs()}_${safe_domain}.json`;
  return writeR2(key, entry as unknown as Record<string, unknown>);
}


// ---------------------------------------------------------------------------
// Sales log — originus/logs/sales/{ts}_{tier}.json
// ---------------------------------------------------------------------------

export interface SalesEntry {
  domain?:     string;
  tier:        string;
  user_id?:    string;
  stripe_url?: string;
  timestamp:   string;
  source:      "cloudflare_worker" | "direct_api" | "unknown";
}

export async function logSales(entry: SalesEntry): Promise<boolean> {
  const key = `originus/logs/sales/${nowTs()}_${entry.tier}.json`;
  return writeR2(key, entry as unknown as Record<string, unknown>);
}
