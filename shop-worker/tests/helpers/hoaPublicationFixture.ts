// Builds real House of Assets publication deliveries for the bridge tests.
//
// The receiver hashes the bytes it is given and opens the archive it is
// given, so a mocked payload would test none of the parts that matter. These
// helpers produce an actual publication package — a real outer ZIP holding a
// real inner customer ZIP, a real cover, and the channel artefacts that must
// never reach a customer — and a manifest whose digests are computed from
// those exact bytes.

import { buildZip } from "./zipFixture";
import { TEST_HOA_BRIDGE_TOKEN } from "./testEnv";
import {
  CUSTOMER_DOWNLOAD_PATH,
  HOA_PUBLICATION_DESTINATION,
  HOA_PUBLICATION_INTENT,
  HOA_PUBLICATION_SCHEMA,
} from "../../src/lib/hoa-publication";

export const BRIDGE_URL = "https://shop-worker.example.workers.dev/shop/bridge/publications";

/** Entries that live beside the customer download in a publishing bundle. */
export const CHANNEL_ARTEFACTS = [
  "BRAND_PACKAGE/brand-kit.zip",
  "MEDIA_SUITE/media-suite.zip",
  "KDP_PACKAGE/interior.pdf",
  "PAYHIP_PACKAGE/payhip-bundle.zip",
  "GUMROAD_PUBLISHING/gumroad-upload.zip",
  "ALL_CHANNELS_MASTER/master.zip",
  "internal/production-notes.txt",
];

async function sha256(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const data =
    bytes instanceof Uint8Array
      ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
      : bytes;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Bytes that begin with a real PNG signature. Nothing decodes them. */
function coverPng(): Uint8Array {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const body = new Uint8Array(256);
  body.set(signature, 0);
  for (let i = signature.length; i < body.length; i++) body[i] = i % 251;
  return body;
}

/** The ZIP a paying customer actually receives. */
export function customerDownloadZip(): ArrayBuffer {
  return buildZip([
    { name: "README.txt", content: "Thank you for your purchase. Everything you bought is in this folder." },
    { name: "The-Guide.pdf", content: "%PDF-1.4 pretend guide contents" },
    { name: "Templates/Template.docx", content: "pretend docx contents" },
  ]);
}

export interface PublicationDelivery {
  manifest: Record<string, unknown>;
  packageBytes: ArrayBuffer;
  customerDownloadBytes: ArrayBuffer;
}

/**
 * A complete, conforming delivery.
 *
 * `mutate` runs after the digests are filled in, so a test can break exactly
 * one field and leave everything else genuinely valid.
 */
export async function buildDelivery(
  mutate: (manifest: Record<string, unknown>) => void = () => {},
  options: { extraEntries?: { name: string; content: string | Uint8Array }[] } = {},
): Promise<PublicationDelivery> {
  const inner = customerDownloadZip();
  const cover = coverPng();

  const packageBytes = buildZip([
    { name: CUSTOMER_DOWNLOAD_PATH, content: new Uint8Array(inner) },
    { name: "media/cover.png", content: cover },
    ...CHANNEL_ARTEFACTS.map((name) => ({ name, content: `internal artefact: ${name}` })),
    ...(options.extraEntries ?? []),
  ]);

  const manifest: Record<string, unknown> = {
    schema: HOA_PUBLICATION_SCHEMA,
    destination: HOA_PUBLICATION_DESTINATION,
    intent: HOA_PUBLICATION_INTENT,
    source: {
      system: "HOUSE_OF_ASSETS",
      commercial_product_id: "hoa-cp-000431",
      commercial_product_version: "1.0.0",
      generated_at: "2026-08-07T09:00:00Z",
    },
    authorization: {
      decision: "APPROVE_AND_PUBLISH",
      authority: "OWNER",
      terms_acknowledged: true,
      price_approved: true,
      terms_acknowledged_at: "2026-08-07T08:55:00Z",
      price_approved_at: "2026-08-07T08:58:00Z",
      approved_by: "owner",
    },
    package: {
      package_id: "hoa-pkg-000431-a",
      sha256: await sha256(packageBytes),
      byte_size: packageBytes.byteLength,
      customer_download: {
        path: CUSTOMER_DOWNLOAD_PATH,
        sha256: await sha256(inner),
        byte_size: inner.byteLength,
        content_type: "application/zip",
      },
      cover_image: {
        path: "media/cover.png",
        sha256: await sha256(cover),
        byte_size: cover.byteLength,
        content_type: "image/png",
      },
    },
    product: {
      sku: "SFL-HOA-0431",
      slug: "operations-readiness-pack",
      title: "Operations Readiness Pack",
      short_description: "A working set of operating documents for a small service business.",
      problem_solved: "Turning ad-hoc operations into something repeatable.",
      description: "A longer description of the pack, sufficient to populate a real listing page.",
      category: "Business & Professional",
      audience: "Owner-operators",
      edition: "Standard Edition",
      version: "1.0",
      supported_formats: "PDF, DOCX",
      deliverables: ["The guide (PDF)", "Editable templates (DOCX)"],
      not_included: ["Software", "Professional advice of any kind"],
      faqs: [{ q: "Is this editable?", a: "Yes — the templates are DOCX." }],
      responsible_use_text: "Templates and guidance only. Not legal, financial, HR or safety advice.",
      refund_eligible: true,
      refund_policy_summary: "Digital product. Refunds reviewed case by case within 14 days.",
      license_type: "SINGLE_PURCHASER_BUSINESS_USE",
    },
    pricing: {
      amount: 224,
      currency: "USD",
    },
  };

  mutate(manifest);
  return { manifest, packageBytes, customerDownloadBytes: inner };
}

/** Wrap a delivery as the multipart request House of Assets posts. */
export function bridgeRequest(
  delivery: Pick<PublicationDelivery, "manifest" | "packageBytes">,
  options: { token?: string | null; manifestText?: string } = {},
): Request {
  const form = new FormData();
  form.set("manifest", options.manifestText ?? JSON.stringify(delivery.manifest));
  form.set("package", new File([delivery.packageBytes], "publication.zip", { type: "application/zip" }));

  const headers = new Headers();
  const token = options.token === undefined ? TEST_HOA_BRIDGE_TOKEN : options.token;
  if (token !== null) headers.set("Authorization", `Bearer ${token}`);

  return new Request(BRIDGE_URL, { method: "POST", body: form, headers });
}

/** Convenience: a section of a delivery manifest, typed loosely for mutation. */
export function section(manifest: Record<string, unknown>, key: string): Record<string, unknown> {
  return manifest[key] as Record<string, unknown>;
}
