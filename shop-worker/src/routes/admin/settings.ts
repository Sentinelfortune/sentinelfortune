import type { AccessIdentity } from "../../lib/auth";
import type { Env } from "../../types";
import { getSetting, listAuditLog, setSetting } from "../../lib/db";
import { logAdminAction } from "../../lib/audit";
import { isValidDownloadExpiryHours, isValidMaxDownloads } from "../../lib/validate";
import { genericError, jsonResponse, safeServerError } from "../../lib/http";

const SETTINGS_KEYS = ["default_download_expiry_hours", "default_max_downloads", "support_email"] as const;

export async function handleAdminGetSettings(_request: Request, env: Env): Promise<Response> {
  try {
    const entries = await Promise.all(SETTINGS_KEYS.map(async (key) => [key, await getSetting(env.SHOP_DB, key)] as const));
    return jsonResponse({ ok: true, settings: Object.fromEntries(entries) });
  } catch (err) {
    return safeServerError("handleAdminGetSettings", err);
  }
}

interface SettingsWriteBody {
  defaultDownloadExpiryHours?: unknown;
  defaultMaxDownloads?: unknown;
  supportEmail?: unknown;
}

export async function handleAdminUpdateSettings(request: Request, env: Env, identity: AccessIdentity): Promise<Response> {
  try {
    let body: SettingsWriteBody;
    try {
      body = (await request.json()) as SettingsWriteBody;
    } catch {
      return genericError(400, "Invalid request body.");
    }

    const now = new Date().toISOString();
    const changed: string[] = [];

    if (body.defaultDownloadExpiryHours !== undefined) {
      if (!isValidDownloadExpiryHours(body.defaultDownloadExpiryHours)) {
        return genericError(422, "defaultDownloadExpiryHours must be an integer between 1 and 720.");
      }
      await setSetting(env.SHOP_DB, "default_download_expiry_hours", String(body.defaultDownloadExpiryHours), now);
      changed.push("default_download_expiry_hours");
    }

    if (body.defaultMaxDownloads !== undefined) {
      if (!isValidMaxDownloads(body.defaultMaxDownloads)) {
        return genericError(422, "defaultMaxDownloads must be an integer between 1 and 100.");
      }
      await setSetting(env.SHOP_DB, "default_max_downloads", String(body.defaultMaxDownloads), now);
      changed.push("default_max_downloads");
    }

    if (body.supportEmail !== undefined) {
      if (typeof body.supportEmail !== "string" || body.supportEmail.length === 0) {
        return genericError(422, "supportEmail must be a non-empty string.");
      }
      await setSetting(env.SHOP_DB, "support_email", body.supportEmail, now);
      changed.push("support_email");
    }

    await logAdminAction(env.SHOP_DB, identity.email, "settings.update", "settings", "global", { changed });

    return jsonResponse({ ok: true, changed });
  } catch (err) {
    return safeServerError("handleAdminUpdateSettings", err);
  }
}

export async function handleAdminWhoami(_request: Request, env: Env, identity: AccessIdentity): Promise<Response> {
  // publicShopBaseUrl lets the Admin build a "View live" link without the
  // storefront's address being compiled into the Admin bundle. The direction of
  // knowledge matters: the Admin may know where the public shop is, but the
  // public shop must never learn where the Admin is. This route is behind
  // Cloudflare Access, and the value is a public URL, not a secret.
  return jsonResponse({
    ok: true,
    email: identity.email,
    environment: env.ENVIRONMENT,
    publicShopBaseUrl: env.SHOP_PUBLIC_BASE_URL,
  });
}

export async function handleAdminAuditLog(_request: Request, env: Env): Promise<Response> {
  try {
    const entries = await listAuditLog(env.SHOP_DB, 200);
    return jsonResponse({ ok: true, entries });
  } catch (err) {
    return safeServerError("handleAdminAuditLog", err);
  }
}
