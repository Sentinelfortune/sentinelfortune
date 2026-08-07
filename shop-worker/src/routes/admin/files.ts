import type { AccessIdentity } from "../../lib/auth";
import type { Env } from "../../types";
import { deleteProductFile, deleteProductImage, getProductById, insertProductFile, insertProductImage, listProductImages } from "../../lib/db";
import { logAdminAction } from "../../lib/audit";
import { newId } from "../../lib/ids";
import { sanitizeFilename, validateDownloadFile, validateImageFile } from "../../lib/validate";
import { genericError, jsonResponse, safeServerError } from "../../lib/http";

const MAX_PREVIEW_IMAGES = 6;

function extensionOf(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "bin";
}

export async function handleAdminUploadImage(request: Request, env: Env, params: Record<string, string>, identity: AccessIdentity): Promise<Response> {
  try {
    const product = await getProductById(env.SHOP_DB, params.id);
    if (!product) return genericError(404, "Product not found.");

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return genericError(400, "Expected multipart/form-data.");
    }

    const file = form.get("file");
    const kindRaw = form.get("kind");
    const altText = String(form.get("altText") ?? "");

    if (!(file instanceof File)) return genericError(400, "A file field is required.");
    const kind = kindRaw === "COVER" || kindRaw === "PREVIEW" ? kindRaw : null;
    if (!kind) return genericError(400, 'kind must be "COVER" or "PREVIEW".');

    const validation = validateImageFile(file.name, file.type, file.size);
    if (!validation.ok) return genericError(422, validation.error ?? "Invalid image file.");

    const existingImages = await listProductImages(env.SHOP_DB, product.id);

    if (kind === "COVER") {
      const existingCover = existingImages.find((img) => img.kind === "COVER");
      if (existingCover) {
        await env.SHOP_ASSETS_BUCKET.delete(existingCover.r2_key);
        await deleteProductImage(env.SHOP_DB, existingCover.id);
      }
    } else {
      const previewCount = existingImages.filter((img) => img.kind === "PREVIEW").length;
      if (previewCount >= MAX_PREVIEW_IMAGES) {
        return genericError(422, `Maximum of ${MAX_PREVIEW_IMAGES} preview images already uploaded. Delete one before adding another.`);
      }
    }

    const ext = extensionOf(sanitizeFilename(file.name));
    const r2Key = `products/${product.id}/images/${kind.toLowerCase()}-${newId()}.${ext}`;

    await env.SHOP_ASSETS_BUCKET.put(r2Key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });

    const position = kind === "COVER" ? 0 : existingImages.filter((img) => img.kind === "PREVIEW").length;

    await insertProductImage(env.SHOP_DB, {
      id: newId(),
      product_id: product.id,
      kind,
      r2_key: r2Key,
      position,
      alt_text: altText,
      created_at: new Date().toISOString(),
    });

    await logAdminAction(env.SHOP_DB, identity.email, "product.image.upload", "product", product.id, { kind, r2Key });

    const images = await listProductImages(env.SHOP_DB, product.id);
    return jsonResponse({ ok: true, images }, 201);
  } catch (err) {
    return safeServerError("handleAdminUploadImage", err);
  }
}

export async function handleAdminDeleteImage(_request: Request, env: Env, params: Record<string, string>, identity: AccessIdentity): Promise<Response> {
  try {
    const image = await deleteProductImage(env.SHOP_DB, params.imageId);
    if (!image) return genericError(404, "Image not found.");
    await env.SHOP_ASSETS_BUCKET.delete(image.r2_key);
    await logAdminAction(env.SHOP_DB, identity.email, "product.image.delete", "product", image.product_id, { imageId: image.id });
    return jsonResponse({ ok: true });
  } catch (err) {
    return safeServerError("handleAdminDeleteImage", err);
  }
}

export async function handleAdminUploadFile(request: Request, env: Env, params: Record<string, string>, identity: AccessIdentity): Promise<Response> {
  try {
    const product = await getProductById(env.SHOP_DB, params.id);
    if (!product) return genericError(404, "Product not found.");

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return genericError(400, "Expected multipart/form-data.");
    }

    const file = form.get("file");
    if (!(file instanceof File)) return genericError(400, "A file field is required.");

    const validation = validateDownloadFile(file.name, file.type, file.size);
    if (!validation.ok) return genericError(422, validation.error ?? "Invalid file.");

    const sanitized = sanitizeFilename(file.name);
    const r2Key = `products/${product.id}/files/${newId()}-${sanitized}`;

    await env.SHOP_DOWNLOADS_BUCKET.put(r2Key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });

    const id = newId();
    await insertProductFile(env.SHOP_DB, {
      id,
      product_id: product.id,
      r2_key: r2Key,
      original_filename: file.name.slice(0, 255),
      sanitized_filename: sanitized,
      content_type: file.type,
      size_bytes: file.size,
      position: 0,
      created_at: new Date().toISOString(),
    });

    await logAdminAction(env.SHOP_DB, identity.email, "product.file.upload", "product", product.id, { fileId: id, filename: sanitized, sizeBytes: file.size });

    return jsonResponse({ ok: true, file: { id, filename: sanitized, contentType: file.type, sizeBytes: file.size } }, 201);
  } catch (err) {
    return safeServerError("handleAdminUploadFile", err);
  }
}

export async function handleAdminDeleteFile(_request: Request, env: Env, params: Record<string, string>, identity: AccessIdentity): Promise<Response> {
  try {
    const file = await deleteProductFile(env.SHOP_DB, params.fileId);
    if (!file) return genericError(404, "File not found.");
    await env.SHOP_DOWNLOADS_BUCKET.delete(file.r2_key);
    await logAdminAction(env.SHOP_DB, identity.email, "product.file.delete", "product", file.product_id, { fileId: file.id, filename: file.sanitized_filename });
    return jsonResponse({ ok: true });
  } catch (err) {
    return safeServerError("handleAdminDeleteFile", err);
  }
}
