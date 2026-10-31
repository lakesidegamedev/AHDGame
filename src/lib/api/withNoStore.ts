/**
 * `withNoStore` — stamp `Cache-Control: no-store` on a route handler's response.
 *
 * Per-user API routes (mail, notifications, profile, etc.) return
 * character/account-scoped bodies. They currently rely on Next.js's implicit
 * no-cache for dynamic routes, which does NOT defend against a Cloudflare page
 * rule, a `Cache Everything` experiment, or a CDN migration — the exact
 * preconditions of the prior cross-user cache-leak incident. Stamping
 * `no-store` at the handler boundary makes the origin's intent explicit and
 * cache-rule-independent.
 *
 * Wrap the exported handler:
 *
 *   export const GET = withNoStore(async (request) => { ... });
 *
 * The header is only set when the handler didn't already send its own
 * `Cache-Control` — so routes that deliberately opt into caching (e.g. a
 * public `s-maxage` response) are left untouched.
 *
 * JSON bodies are also compressed at the origin (`jsonCompression.ts`).
 * `no-transform` is deliberately kept: it is what stops Cloudflare re-encoding
 * with zstd, which old Android WebViews cannot decode. Because `no-transform`
 * also suppresses Next's and Cloudflare's own compression, encoding the body
 * here (Brotli/gzip, chosen by `Accept-Encoding`) is the only way these
 * payloads stop travelling uncompressed.
 */
import { compressJsonResponse } from "@/lib/api/jsonCompression";

type RouteHandler<A extends unknown[]> = (...args: A) => Promise<Response> | Response;

export interface WithNoStoreOptions {
  /** Set false for handlers that return binary or pre-encoded bodies. */
  compress?: boolean;
}

export function withNoStore<A extends unknown[]>(
  handler: RouteHandler<A>,
  options: WithNoStoreOptions = {}
): (...args: A) => Promise<Response> {
  return async (...args: A): Promise<Response> => {
    const response = await handler(...args);
    if (!response.headers.has("Cache-Control")) {
      // `no-transform` stops Cloudflare re-compressing the body with zstd, whose
      // Content-Encoding some Android System WebView builds cannot decode —
      // surfacing to client fetch() as a thrown "Network error". Brotli/gzip
      // (universally supported) are used instead. Orthogonal to cacheability.
      response.headers.set("Cache-Control", "no-store, no-transform");
    }
    if (options.compress === false) return response;
    const request = args[0] instanceof Request ? args[0] : undefined;
    return compressJsonResponse(response, request);
  };
}
