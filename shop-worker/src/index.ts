import type { Env } from "./types";
import { Router } from "./router";
import { handlePreflight, withCors } from "./lib/cors";
import { requireOwnerAccess } from "./lib/auth";
import { genericError, jsonResponse } from "./lib/http";

import { handleGetProduct, handleListProducts } from "./routes/products";
import { handleCreateCheckout } from "./routes/checkout";
import { handleStripeWebhook } from "./routes/webhook";
import { handleDownload } from "./routes/download";
import { handleGetAsset } from "./routes/asset";
import { handleOrderStatus } from "./routes/order-status";
import { handleHoaPublication } from "./routes/bridge/publications";

import {
  handleAdminArchiveProduct,
  handleAdminCreateProduct,
  handleAdminDuplicateProduct,
  handleAdminGetProduct,
  handleAdminListProducts,
  handleAdminPreviewProduct,
  handleAdminPublishProduct,
  handleAdminSetPrice,
  handleAdminUnpublishProduct,
  handleAdminUpdateProduct,
} from "./routes/admin/products";
import { handleAdminDeleteFile, handleAdminDeleteImage, handleAdminUploadFile, handleAdminUploadImage } from "./routes/admin/files";
import {
  handleAdminGetOrder,
  handleAdminListLicenses,
  handleAdminListOrders,
  handleAdminReplacementLink,
  handleAdminResendEmail,
  handleAdminRevokeLicense,
} from "./routes/admin/orders";
import { handleImportCommit, handleImportValidate } from "./routes/admin/import";
import { handleAdminAuditLog, handleAdminGetSettings, handleAdminUpdateSettings, handleAdminWhoami } from "./routes/admin/settings";

const router = new Router<Env>();

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------
router.get("/shop/health", async () => jsonResponse({ ok: true, service: "sentinel-fortune-shop-worker" }));
router.get("/shop/products", async (request, env) => handleListProducts(request, env));
router.get("/shop/products/:slug", async (request, env, _ctx, params) => handleGetProduct(request, env, params));
router.post("/shop/checkout", async (request, env) => handleCreateCheckout(request, env));
// Post-checkout delivery for the buyer's own browser, keyed on the Stripe
// Checkout Session id from their redirect URL. See routes/order-status.ts.
router.get("/shop/order/status", async (request, env) => handleOrderStatus(request, env));
router.post("/shop/stripe/webhook", async (request, env) => handleStripeWebhook(request, env));
router.get("/shop/download/:token", async (request, env, _ctx, params) => handleDownload(request, env, params));
// Product cover/preview images, served from the (private) assets bucket so no
// R2 bucket in this system needs public access. See src/lib/assets.ts.
router.get("/shop/asset/:id", async (request, env, _ctx, params) => handleGetAsset(request, env, params));

// ---------------------------------------------------------------------------
// Machine-to-machine bridge — House of Assets only.
//
// NOT under /shop/admin/, so it does not go through the Cloudflare Access
// gate below: Access authenticates a person in a browser and there is no
// browser here. The handler authenticates the caller itself, against the
// HOA_PUBLICATION_BRIDGE_TOKEN secret, and refuses every request when that
// secret is unset. Holding the bridge token grants exactly this route and no
// Admin capability whatsoever.
//
// The CORS allow-list never permits an Authorization header, so no web page
// can present this credential from a browser either.
// ---------------------------------------------------------------------------
router.post("/shop/bridge/publications", async (request, env) => handleHoaPublication(request, env));

// ---------------------------------------------------------------------------
// Admin routes — every one of these is wrapped by the auth gate in fetch()
// below before it ever reaches these handlers.
// ---------------------------------------------------------------------------
router.get("/shop/admin/whoami", async (request, env, _ctx, _params) => {
  const identity = (request as Request & { __identity?: { email: string; sub: string } }).__identity;
  return handleAdminWhoami(request, env, identity!);
});

router.get("/shop/admin/products", async (request, env) => handleAdminListProducts(request, env));
router.post("/shop/admin/products", async (request, env) => {
  const identity = getIdentity(request);
  return handleAdminCreateProduct(request, env, identity);
});
router.get("/shop/admin/products/:id", async (request, env, _ctx, params) => handleAdminGetProduct(request, env, params));
router.get("/shop/admin/products/:id/preview", async (request, env, _ctx, params) => handleAdminPreviewProduct(request, env, params));
router.put("/shop/admin/products/:id", async (request, env, _ctx, params) => handleAdminUpdateProduct(request, env, params, getIdentity(request)));
router.post("/shop/admin/products/:id/price", async (request, env, _ctx, params) => handleAdminSetPrice(request, env, params, getIdentity(request)));
router.post("/shop/admin/products/:id/publish", async (request, env, _ctx, params) => handleAdminPublishProduct(request, env, params, getIdentity(request)));
router.post("/shop/admin/products/:id/unpublish", async (request, env, _ctx, params) => handleAdminUnpublishProduct(request, env, params, getIdentity(request)));
router.post("/shop/admin/products/:id/archive", async (request, env, _ctx, params) => handleAdminArchiveProduct(request, env, params, getIdentity(request)));
router.post("/shop/admin/products/:id/duplicate", async (request, env, _ctx, params) => handleAdminDuplicateProduct(request, env, params, getIdentity(request)));

router.post("/shop/admin/products/:id/images", async (request, env, _ctx, params) => handleAdminUploadImage(request, env, params, getIdentity(request)));
router.delete("/shop/admin/products/:id/images/:imageId", async (request, env, _ctx, params) => handleAdminDeleteImage(request, env, params, getIdentity(request)));
router.post("/shop/admin/products/:id/files", async (request, env, _ctx, params) => handleAdminUploadFile(request, env, params, getIdentity(request)));
router.delete("/shop/admin/products/:id/files/:fileId", async (request, env, _ctx, params) => handleAdminDeleteFile(request, env, params, getIdentity(request)));

router.get("/shop/admin/orders", async (request, env) => handleAdminListOrders(request, env));
router.get("/shop/admin/orders/:id", async (request, env, _ctx, params) => handleAdminGetOrder(request, env, params));
router.post("/shop/admin/orders/:id/resend-email", async (request, env, _ctx, params) => handleAdminResendEmail(request, env, params, getIdentity(request)));
router.post("/shop/admin/orders/:id/replacement-link", async (request, env, _ctx, params) => handleAdminReplacementLink(request, env, params, getIdentity(request)));

router.get("/shop/admin/licenses", async (request, env) => handleAdminListLicenses(request, env));
router.post("/shop/admin/licenses/:id/revoke", async (request, env, _ctx, params) => handleAdminRevokeLicense(request, env, params, getIdentity(request)));

router.get("/shop/admin/settings", async (request, env) => handleAdminGetSettings(request, env));
router.post("/shop/admin/settings", async (request, env) => handleAdminUpdateSettings(request, env, getIdentity(request)));
router.get("/shop/admin/audit-log", async (request, env) => handleAdminAuditLog(request, env));

// Governed product-package import. /validate writes nothing; /commit re-runs
// the identical validation before touching D1 or R2. See routes/admin/import.ts.
router.post("/shop/admin/import/validate", async (request, env) => handleImportValidate(request, env));
router.post("/shop/admin/import/commit", async (request, env) => handleImportCommit(request, env, getIdentity(request)));

function getIdentity(request: Request): { email: string; sub: string } {
  const identity = (request as Request & { __identity?: { email: string; sub: string } }).__identity;
  if (!identity) throw new Error("Identity missing on authenticated route — auth gate bug.");
  return identity;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const preflight = handlePreflight(request, env);
    if (preflight) return preflight;

    const url = new URL(request.url);

    if (url.pathname.startsWith("/shop/admin/")) {
      const identity = await requireOwnerAccess(request, env);
      if (!identity) {
        return withCors(genericError(401, "Owner authentication required."), request, env);
      }
      (request as Request & { __identity?: { email: string; sub: string } }).__identity = identity;
    }

    const result = await router.handle(request, env, ctx, url.pathname);
    if (!result) {
      return withCors(genericError(404, "Not found."), request, env);
    }
    return withCors(result, request, env);
  },
};
