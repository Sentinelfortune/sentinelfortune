/**
 * R2 reader — Deal Viewer (read-only)
 * Reads qualification records from originus/bot/deals/intake/
 * No writes performed. Uses existing R2 credentials from env.
 */
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

const BUCKET  = process.env["CF_R2_BUCKET"]  ?? "originus-infinity-vault";
const PREFIX  = "originus/bot/deals/intake/";

// Match only qualification records: OEM-YYYYMMDD-XXXX.json etc.
const QUAL_KEY_RE = /(OEM|LIC|INV|LEG|CON)-\d{8}-[A-Z0-9]{4}\.json$/;

export interface DealRecord {
  ref_id:         string;
  desk:           string;
  classification: string;
  completed_at:   string;
  answers:        Record<string, string>;
  final_summary:  string;
  next_action:    string;
  status:         string;
  source:         string;
  bot_username:   string;
}

function buildClient(): S3Client | null {
  const accountId  = process.env["CF_ACCOUNT_ID"]?.trim();
  const accessKey  = process.env["CF_R2_ACCESS_KEY_ID"]?.trim();
  const secretKey  = process.env["CF_R2_SECRET_ACCESS_KEY"]?.trim();
  if (!accountId || !accessKey || !secretKey) return null;

  return new S3Client({
    endpoint:    `https://${accountId}.r2.cloudflarestorage.com`,
    region:      "auto",
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: false,
  });
}

async function fetchRecord(
  client: S3Client,
  key: string,
): Promise<DealRecord | null> {
  try {
    const res  = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const body = await res.Body?.transformToString();
    return body ? (JSON.parse(body) as DealRecord) : null;
  } catch {
    return null;
  }
}

export async function listDeals(limit = 50): Promise<DealRecord[]> {
  const client = buildClient();
  if (!client) return [];

  const res = await client.send(
    new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX, MaxKeys: limit }),
  );

  const keys = (res.Contents ?? [])
    .map((o) => o.Key!)
    .filter((k): k is string => Boolean(k) && QUAL_KEY_RE.test(k));

  const records = await Promise.all(keys.map((k) => fetchRecord(client, k)));

  return (records.filter(
    (r): r is DealRecord => r !== null && Boolean(r.ref_id) && Boolean(r.completed_at),
  )).sort(
    (a, b) =>
      new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime(),
  );
}

export async function getDeal(refId: string): Promise<DealRecord | null> {
  if (!QUAL_KEY_RE.test(`${refId}.json`)) return null;
  const client = buildClient();
  if (!client) return null;
  return fetchRecord(client, `${PREFIX}${refId}.json`);
}

// ---------------------------------------------------------------------------
// Routed records
// ---------------------------------------------------------------------------

const ROUTED_PREFIX  = "originus/bot/deals/routed/";
const ROUTED_DESKS   = ["oem", "licensing", "investor", "legal", "contact"] as const;

export interface RoutedRecord extends DealRecord {
  route_target:  string;
  routed_at:     string;
  source_path:   string;
  intake_path:   string;
  // Scoring fields (optional — absent on legacy records)
  score?:         number;
  priority?:      string;
  urgency?:       string;
  score_reason?:  string;
  // Action fields (optional — absent on legacy records)
  review_bucket?: string;
  sla_target?:    string;
  next_action?:   string;
  owner_queue?:   string;
}

async function fetchRoutedRecord(
  client: S3Client,
  key: string,
): Promise<RoutedRecord | null> {
  try {
    const res  = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const body = await res.Body?.transformToString();
    return body ? (JSON.parse(body) as RoutedRecord) : null;
  } catch {
    return null;
  }
}

function sortByRoutedAt(records: RoutedRecord[]): RoutedRecord[] {
  return records.sort(
    (a, b) =>
      new Date(b.routed_at ?? b.completed_at).getTime() -
      new Date(a.routed_at ?? a.completed_at).getTime(),
  );
}

export async function listRoutedDeals(limit = 50): Promise<RoutedRecord[]> {
  const client = buildClient();
  if (!client) return [];

  const all: RoutedRecord[] = [];

  for (const desk of ROUTED_DESKS) {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket:  BUCKET,
        Prefix:  `${ROUTED_PREFIX}${desk}/`,
        MaxKeys: limit,
      }),
    );
    const keys = (res.Contents ?? [])
      .map((o) => o.Key!)
      .filter((k): k is string => Boolean(k) && QUAL_KEY_RE.test(k));

    const records = await Promise.all(keys.map((k) => fetchRoutedRecord(client, k)));
    all.push(...records.filter((r): r is RoutedRecord => r !== null && Boolean(r.ref_id)));
  }

  return sortByRoutedAt(all);
}

export async function listRoutedByDesk(desk: string, limit = 50): Promise<RoutedRecord[]> {
  if (!ROUTED_DESKS.includes(desk as typeof ROUTED_DESKS[number])) return [];
  const client = buildClient();
  if (!client) return [];

  const res = await client.send(
    new ListObjectsV2Command({
      Bucket:  BUCKET,
      Prefix:  `${ROUTED_PREFIX}${desk}/`,
      MaxKeys: limit,
    }),
  );
  const keys = (res.Contents ?? [])
    .map((o) => o.Key!)
    .filter((k): k is string => Boolean(k) && QUAL_KEY_RE.test(k));

  const records = await Promise.all(keys.map((k) => fetchRoutedRecord(client, k)));
  return sortByRoutedAt(
    records.filter((r): r is RoutedRecord => r !== null && Boolean(r.ref_id)),
  );
}
