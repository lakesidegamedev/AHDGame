/**
 * `withNoStore` stamps `Cache-Control: no-store` on a route handler's response.
 * User-scoped API routes depend on Next's implicit no-cache, which does not
 * defend against CDN page rules or `Cache Everything` experiments. Stamping at
 * the handler boundary makes the origin's intent explicit and cache-rule
 * independent. Skips routes that set their own `Cache-Control` so deliberate
 * caching (`s-maxage`) is untouched.
 *
 * JSON bodies are compressed here because `no-transform` (kept to stop
 * Cloudflare re-encoding with zstd, undecodable by old Android WebViews) also
 * suppresses Next's and Cloudflare's own compression.
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
