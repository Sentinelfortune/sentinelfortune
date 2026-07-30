// ID generation. Every ID in this system is server-generated — the browser
// never supplies an ID that gets trusted as a primary key or foreign key.

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function dateStamp(now: Date): string {
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1, 2)}${pad(now.getUTCDate(), 2)}`;
}

function randomBase32(length: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids operator transcription errors
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function newOrderNumber(now: Date = new Date()): string {
  return `SFL-ORD-${dateStamp(now)}-${randomBase32(6)}`;
}

export function newLicenseNumber(now: Date = new Date()): string {
  return `SFL-LIC-${dateStamp(now)}-${randomBase32(6)}`;
}

/** Raw, high-entropy download token. Sent to the customer once; never stored raw. */
export function newDownloadToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}
