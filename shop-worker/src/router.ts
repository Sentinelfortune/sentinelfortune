// Minimal, dependency-free path router. Deliberately not using a framework
// (Hono, itty-router, etc.) — the Shop Worker has zero runtime dependencies
// by design (see src/lib/stripe.ts and src/lib/resend.ts for the same
// rationale), and the route table here is small enough that a framework
// would add indirection without adding real value.

export type RouteHandler<Env> = (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  params: Record<string, string>,
) => Promise<Response>;

interface CompiledRoute<Env> {
  method: string;
  keys: string[];
  regex: RegExp;
  handler: RouteHandler<Env>;
}

function compilePattern(pattern: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = [];
  const escaped = pattern
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        keys.push(segment.slice(1));
        return "([^/]+)";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return { regex: new RegExp(`^${escaped}$`), keys };
}

export class Router<Env> {
  private routes: CompiledRoute<Env>[] = [];

  private add(method: string, pattern: string, handler: RouteHandler<Env>): this {
    const { regex, keys } = compilePattern(pattern);
    this.routes.push({ method, regex, keys, handler });
    return this;
  }

  get(pattern: string, handler: RouteHandler<Env>): this {
    return this.add("GET", pattern, handler);
  }

  post(pattern: string, handler: RouteHandler<Env>): this {
    return this.add("POST", pattern, handler);
  }

  put(pattern: string, handler: RouteHandler<Env>): this {
    return this.add("PUT", pattern, handler);
  }

  delete(pattern: string, handler: RouteHandler<Env>): this {
    return this.add("DELETE", pattern, handler);
  }

  /** Returns null if no route matched (caller should respond 404). */
  async handle(request: Request, env: Env, ctx: ExecutionContext, pathname: string): Promise<Response | null> {
    for (const route of this.routes) {
      if (route.method !== request.method) continue;
      const match = route.regex.exec(pathname);
      if (!match) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((key, i) => {
        params[key] = decodeURIComponent(match[i + 1]);
      });
      return route.handler(request, env, ctx, params);
    }
    return null;
  }
}
