// Builds real ZIP archives in tests.
//
// The importer parses actual ZIP bytes, so testing it against a hand-mocked
// archive object would test nothing that matters. These helpers produce
// byte-accurate stored (uncompressed) ZIPs, which the reader handles through
// the same code path as deflated ones.

import { crc32 } from "../../src/lib/zip";

export interface ZipFixtureEntry {
  name: string;
  content: string | Uint8Array;
}

function bytesOf(content: string | Uint8Array): Uint8Array {
  return typeof content === "string" ? new TextEncoder().encode(content) : content;
}

/** Build a valid ZIP archive containing the given entries, stored uncompressed. */
export function buildZip(entries: ZipFixtureEntry[]): ArrayBuffer {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = bytesOf(entry.content);
    const sum = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);        // version needed
    lv.setUint16(6, 0, true);         // flags
    lv.setUint16(8, 0, true);         // method: stored
    lv.setUint16(10, 0, true);        // mod time
    lv.setUint16(12, 0, true);        // mod date
    lv.setUint32(14, sum, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);        // extra length
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);        // version made by
    cv.setUint16(6, 20, true);        // version needed
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);        // method: stored
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, sum, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);        // extra
    cv.setUint16(32, 0, true);        // comment
    cv.setUint16(34, 0, true);        // disk
    cv.setUint16(36, 0, true);        // internal attrs
    cv.setUint32(38, 0, true);        // external attrs
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out.buffer;
}

/** A complete, conforming manifest. Override any field to make it fail. */
export function validManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contractVersion: 1,
    producer: "Test production studio",
    builtAt: "2026-08-01T00:00:00Z",
    sku: "SFL-TEST-001",
    slug: "governed-import-test-product",
    title: "Governed Import Test Product",
    version: "1.0",
    edition: "Standard Edition",
    category: "Business Operations",
    audience: "Home-service businesses",
    licenseType: "SINGLE_BUSINESS",
    licenseName: "Single Business",
    supportedFormats: "PDF, DOCX",
    shortDescription: "A test product used to verify the governed import path.",
    problemSolved: "Verifying that a package imports as a fully populated draft.",
    description: "A longer description of the test product, sufficient to populate the listing.",
    deliverables: ["The guide (PDF)", "The template (DOCX)"],
    notIncluded: ["Software", "Professional advice of any kind"],
    faqs: [{ q: "Is this a real product?", a: "No. It exists to exercise the import path." }],
    responsibleUseText: "Templates and guidance only. Not legal, financial, HR or safety advice.",
    refundEligible: true,
    refundPolicySummary: "Digital product. Refunds reviewed case by case within 14 days.",
    recommendedPriceCents: 4900,
    currency: "usd",
    downloadLinkExpiryHours: 72,
    maxDownloads: 5,
    coverImage: null,
    files: [
      { path: "01-Guide/Guide.pdf", title: "The guide", format: "pdf", bytes: 12 },
      { path: "02-Template/Template.docx", title: "The template", format: "docx", bytes: 16 },
    ],
    ...overrides,
  };
}

/** A conforming package: manifest plus exactly the files it declares. */
export function buildPackage(
  manifest: Record<string, unknown> = validManifest(),
  extraEntries: ZipFixtureEntry[] = [],
): ArrayBuffer {
  const declared = (manifest.files as { path: string }[] | undefined) ?? [];
  return buildZip([
    { name: "PRODUCT-MANIFEST.json", content: JSON.stringify(manifest, null, 2) },
    ...declared.map((f) => ({ name: f.path, content: `contents of ${f.path}` })),
    ...extraEntries,
  ]);
}

/** Wrap package bytes as the multipart request the admin UI sends. */
export function importRequest(bytes: ArrayBuffer, filename = "package.zip", search = ""): Request {
  const form = new FormData();
  form.set("file", new File([bytes], filename, { type: "application/zip" }));
  return new Request(`https://shop-worker.example.workers.dev/shop/admin/import/commit${search}`, {
    method: "POST",
    body: form,
  });
}
