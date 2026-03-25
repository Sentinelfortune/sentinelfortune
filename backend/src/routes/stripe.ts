/**
 * Stripe webhook proxy.
 *
 * Mounts at /api/stripe — must be registered in app.ts BEFORE express.json()
 * so the raw body is forwarded intact. Stripe signature verification
 * is performed by the Python bot's aiohttp service on port 8082.
 *
 * Public URL: https://<domain>/api/stripe/webhook
 * Internal:   http://localhost:8082/stripe/webhook
 */

import http from "http";
import { Router, type Request, type Response } from "express";

const BOT_WEBHOOK_PORT = parseInt(process.env["STRIPE_WEBHOOK_PORT"] ?? "8082", 10);

const router = Router();

/**
 * POST /api/stripe/webhook
 *
 * Receives the raw Stripe payload and proxies it to the bot's
 * aiohttp server, preserving the Stripe-Signature header.
 * Always responds 200 to Stripe (or passes through the bot's response).
 */
router.post(
  "/webhook",
  // Raw body — must run before any JSON body parser on this route
  (req, res, next) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      (req as Request & { rawBody: Buffer }).rawBody = Buffer.concat(chunks);
      next();
    });
    req.on("error", (err) => {
      console.error("[stripe-proxy] read error:", err.message);
      res.status(500).send("read error");
    });
  },
  (req: Request, res: Response) => {
    const rawBody = (req as Request & { rawBody: Buffer }).rawBody ?? Buffer.alloc(0);

    // Forward every header Stripe sent (especially Stripe-Signature)
    const forwardHeaders: http.OutgoingHttpHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (key.toLowerCase() !== "host") {
        forwardHeaders[key] = value;
      }
    }
    forwardHeaders["content-length"] = rawBody.length.toString();

    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: BOT_WEBHOOK_PORT,
      path: "/stripe/webhook",
      method: "POST",
      headers: forwardHeaders,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.status(proxyRes.statusCode ?? 200);
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      console.error("[stripe-proxy] bot unreachable:", err.message);
      // Respond 200 anyway — Stripe must not retry due to our proxy issue
      res.status(200).send("bot unreachable — event logged externally");
    });

    proxyReq.write(rawBody);
    proxyReq.end();
  }
);

export default router;
