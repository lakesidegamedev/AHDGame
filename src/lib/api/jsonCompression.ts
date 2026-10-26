import { brotliCompress, constants, gzip } from "node:zlib";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

/**
 * Origin-side compression for JSON API responses.
 *
 * Why this exists
 * ---------------
 * Every API response in this app carries `Cache-Control: no-transform` so that
 * Cloudflare never re-encodes a body with zstd — a Content-Encoding some
 * Android System WebView builds cannot decode, which surfaced as a thrown
 * "Network error" in client `fetch()` (Lakeside bug #0795). Correct as that is
 * for compatibility, `no-transform` also suppresses *all* compression:
 *
 *   - Next's `next start` compression middleware is the `compression` package,
 *     which deliberately skips any response whose Cache-Control contains
 *     `no-transform`.
 *   - Cloudflare honours the directive too, so it forwards the body verbatim
 *     instead of compressing it at the edge.
 *
 * Measured in production on 2026-10-24: `GET /api/corporations/1` was 923,100
 * bytes on the wire with no `content-encoding`, and `/api/corporations/1/history`
 * was 429,978 bytes, both despite `Accept-Encoding: gzip, br`.
 *
 * This helper encodes the body ourselves, at the origin. The response still
 * says `no-transform`, so Cloudflare passes the bytes straight through: the
 * client always receives gzip/Brotli (which every WebView decodes) and never
 * zstd. It is therefore a pure transfer-size win with no change to the
 * compatibility fix it sits on top of.
 */

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

export type JsonContentEncoding = "br" | "gzip";

/**
 * Bodies smaller than this are not worth encoding: the gzip/Brotli header and
 * trailer alone cost 18-20 bytes, and most small JSON already fits one TCP
 * segment. This matches the usual 1 KB threshold used by CDNs.
 */
export const MIN_JSON_COMPRESS_BYTES = 1024;

/** Parse an `Accept-Encoding` header and pick the best supported encoding. */
export function negotiateJsonEncoding(
  acceptEncoding: string | null | undefined
): JsonContentEncoding | null {
  if (!acceptEncoding) return null;

  const qualities = new Map<string, number>();
  for (const part of acceptEncoding.split(",")) {
    const [rawName, ...params] = part.trim().toLowerCase().split(";");
    const name = rawName?.trim();
    if (!name) continue;
    let quality = 1;
    for (const param of params) {
      const [rawKey, rawValue] = param.trim().split("=");
      if (rawKey?.trim() !== "q") continue;
      const parsed = Number.parseFloat(rawValue ?? "");
      if (Number.isFinite(parsed)) quality = parsed;
    }
    qualities.set(name, quality);
  }

  const wildcard = qualities.get("*") ?? 0;
  const brotli = qualities.get("br") ?? wildcard;
  const gzipQuality = qualities.get("gzip") ?? qualities.get("x-gzip") ?? wildcard;

  // Brotli first: for JSON it is usually 15-25% smaller than gzip. Ties go to
  // Brotli because it decodes faster in the browser as well.
  if (brotli > 0 && brotli >= gzipQuality) return "br";
  if (gzipQuality > 0) return "gzip";
  return null;
}

function normalizedContentType(response: Response): string {
  return (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

function isJsonResponse(response: Response): boolean {
  const type = normalizedContentType(response);
  return type === "application/json" || type === "text/json" || type.endsWith("+json");
}

/**
 * Copy headers without collapsing repeated `Set-Cookie` values: a plain
 * `headers.entries()` round-trip joins them with commas, which breaks cookies.
 */
function cloneHeaders(source: Headers): Headers {
  const headers = new Headers();
  for (const [key, value] of source.entries()) {
    if (key.toLowerCase() === "set-cookie") continue;
    headers.append(key, value);
  }
  const setCookies = typeof source.getSetCookie === "function" ? source.getSetCookie() : [];
  for (const cookie of setCookies) headers.append("set-cookie", cookie);
  return headers;
}

function withAcceptEncodingVary(headers: Headers): void {
  const existing = (headers.get("vary") ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (existing.includes("accept-encoding") || existing.includes("*")) return;
  headers.set("vary", [...existing, "accept-encoding"].join(", "));
}

/**
 * Compress a JSON response body when the client accepts it and it is big
 * enough to pay off. Any other response is returned untouched, so this is safe
 * to call on every route handler response.
 */
export async function compressJsonResponse(
  response: Response,
  request: Request | undefined
): Promise<Response> {
  if (!request) return response;
  if (response.status < 200 || response.status === 204 || response.status === 304) return response;
  if (!isJsonResponse(response)) return response;
  // Already encoded (a route compressed it, or an upstream proxy did).
  if (response.headers.has("content-encoding")) return response;
  if (!response.body) return response;

  const encoding = negotiateJsonEncoding(request.headers.get("accept-encoding"));
  if (!encoding) return response;

  const raw = new Uint8Array(await response.arrayBuffer());
  const headers = cloneHeaders(response.headers);
  withAcceptEncodingVary(headers);

  // Rebuild even when we do not compress, because the original body has been
  // consumed by the read above.
  const rebuild = (body: Uint8Array<ArrayBuffer>) => {
    headers.delete("content-length");
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };

  if (raw.byteLength < MIN_JSON_COMPRESS_BYTES) return rebuild(raw);

  // Quality 4 is the usual server-side sweet spot: nearly gzip-9's ratio on
  // JSON at a fraction of the CPU. Handlers must stay responsive under load.
  const compressed =
    encoding === "br"
      ? await brotliAsync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
      : await gzipAsync(raw);

  // Incompressible (tiny or already dense) payloads are sent as-is.
  if (compressed.byteLength >= raw.byteLength) return rebuild(raw);

  // Copy into a fresh ArrayBuffer: Node's zlib buffers are typed as
  // Uint8Array<ArrayBufferLike>, which BodyInit does not accept.
  const compressedBytes = new Uint8Array(compressed.byteLength);
  compressedBytes.set(compressed);

  headers.set("content-encoding", encoding);
  headers.set("content-length", String(compressedBytes.byteLength));
  return new Response(compressedBytes, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * `NextResponse.json` with origin-side compression applied. Use this for the
 * large JSON payloads fetched after the page shell renders.
 */
export async function compressedJson(
  request: Request,
  data: unknown,
  init: ResponseInit = {}
): Promise<Response> {
  return compressJsonResponse(NextResponse.json(data, init), request);
}
