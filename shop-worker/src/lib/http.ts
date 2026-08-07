// Response helpers. Customer-facing error bodies are always short and
// generic; the detailed reason is only ever written to console (Worker
// logs), never returned to the caller — see the security checklist item
// "generic customer errors / detailed safe server logs".

export function jsonResponse(body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

export function genericError(status: number, publicMessage: string, extraHeaders: HeadersInit = {}): Response {
  return jsonResponse({ ok: false, error: publicMessage }, status, extraHeaders);
}

/** Logs full detail server-side, returns only a generic message to the caller. */
export function safeServerError(context: string, err: unknown, status = 500): Response {
  const detail = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error(`[shop-worker] ${context}:`, detail);
  return genericError(status, "Something went wrong. Please try again or contact support.");
}
