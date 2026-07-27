import type { DownloadEventResult, Env } from "../types";
import {
  getDownloadAuthorizationByHash,
  getLicenseById,
  incrementDownloadCount,
  insertDownloadEvent,
  listProductFiles,
} from "../lib/db";
import { evaluateDownloadAuthorization, hashDownloadToken } from "../lib/download-auth";
import { newId } from "../lib/ids";
import { hashIp } from "../lib/ratelimit";
import { genericError, jsonResponse, safeServerError } from "../lib/http";

const EVALUATION_STATUS: Record<string, { status: number; message: string }> = {
  NOT_FOUND: { status: 404, message: "Download link not found." },
  EXPIRED: { status: 410, message: "This download link has expired. Request a replacement via the license lookup page." },
  REVOKED: { status: 403, message: "This download link has been revoked." },
  LIMIT_REACHED: { status: 403, message: "This download link has reached its maximum number of uses. Request a replacement." },
};

/**
 * GET /shop/download/:token
 * GET /shop/download/:token?file=<productFileId>
 *
 * Files remain private in R2 at all times — this handler streams the object
 * bytes through the Worker rather than ever returning a public R2 URL.
 * A valid, unexpired, unrevoked, under-limit token is required for every
 * byte served.
 */
export async function handleDownload(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  try {
    const token = params.token;
    const url = new URL(request.url);
    const fileIdParam = url.searchParams.get("file");

    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const ipHash = await hashIp(ip);
    const userAgent = (request.headers.get("User-Agent") ?? "").slice(0, 255);
    const now = new Date();

    const tokenHash = await hashDownloadToken(token);
    const auth = await getDownloadAuthorizationByHash(env.SHOP_DB, tokenHash);
    const evaluation = evaluateDownloadAuthorization(auth, now);

    if (evaluation !== "OK") {
      if (auth) {
        await logEvent(env, auth.id, fileIdParam, ipHash, userAgent, evaluation as DownloadEventResult, now);
      }
      const mapped = EVALUATION_STATUS[evaluation];
      return genericError(mapped.status, mapped.message);
    }

    // evaluation === "OK" implies auth is non-null.
    const authorization = auth!;

    const license = await getLicenseById(env.SHOP_DB, authorization.license_id);
    if (!license || license.status !== "ACTIVE") {
      await logEvent(env, authorization.id, fileIdParam, ipHash, userAgent, "REVOKED", now);
      return genericError(403, "This license is no longer active.");
    }

    const files = await listProductFiles(env.SHOP_DB, license.product_id);
    if (files.length === 0) {
      await logEvent(env, authorization.id, fileIdParam, ipHash, userAgent, "NOT_FOUND", now);
      return genericError(404, "No files are currently available for this order. Contact support.");
    }

    let targetFile = files[0];
    if (fileIdParam) {
      const match = files.find((f) => f.id === fileIdParam);
      if (!match) {
        await logEvent(env, authorization.id, fileIdParam, ipHash, userAgent, "NOT_FOUND", now);
        return genericError(404, "File not found for this order.");
      }
      targetFile = match;
    } else if (files.length > 1) {
      // Multiple files and no selection made — list them. Listing does not
      // consume the download budget; only streaming a file does.
      return jsonResponse({
        ok: true,
        multipleFiles: true,
        files: files.map((f) => ({ id: f.id, filename: f.sanitized_filename, sizeBytes: f.size_bytes })),
      });
    }

    const object = await env.SHOP_DOWNLOADS_BUCKET.get(targetFile.r2_key);
    if (!object || !object.body) {
      await logEvent(env, authorization.id, targetFile.id, ipHash, userAgent, "ERROR", now);
      return genericError(404, "File temporarily unavailable. Contact support.");
    }

    await incrementDownloadCount(env.SHOP_DB, authorization.id);
    await logEvent(env, authorization.id, targetFile.id, ipHash, userAgent, "SUCCESS", now);

    return new Response(object.body, {
      status: 200,
      headers: {
        "Content-Type": targetFile.content_type,
        "Content-Disposition": `attachment; filename="${targetFile.sanitized_filename}"`,
        "Content-Length": String(targetFile.size_bytes),
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (err) {
    return safeServerError("handleDownload", err);
  }
}

async function logEvent(
  env: Env,
  authId: string,
  productFileId: string | null,
  ipHash: string,
  userAgent: string,
  result: DownloadEventResult,
  now: Date,
): Promise<void> {
  await insertDownloadEvent(env.SHOP_DB, {
    id: newId(),
    download_authorization_id: authId,
    product_file_id: productFileId,
    ip_hash: ipHash,
    user_agent: userAgent,
    result,
    created_at: now.toISOString(),
  });
}
