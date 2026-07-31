// Cloudflare Pages Function — catch-all for /api/*.
//
// This is the only server-side entrypoint of the Owner Admin Pages project.
// All logic lives in ../_shared/proxy.ts so it can be unit tested; keep this
// file a one-liner. Directories under functions/ that start with "_" are not
// routed, which is why the shared module lives there.
//
// Requests reaching this function have already passed Cloudflare Access,
// because Access protects this Pages hostname. The proxy still fails closed if
// no Access token is present, and the Shop Worker independently verifies the
// token — neither layer trusts the other's say-so.

import { handleAdminProxy, type ProxyEnv } from "../_shared/proxy";

export async function onRequest(context: { request: Request; env: ProxyEnv }): Promise<Response> {
  return handleAdminProxy(context.request, context.env);
}
