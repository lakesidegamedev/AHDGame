import { NextResponse } from "next/server";
import { createHash } from "crypto";

/**
 * ETag-based conditional JSON response for polling endpoints.
 *
 * Returns JSON with a strong ETag computed from the body. If the request's
 * `If-None-Match` matches, returns a body-less `304 Not Modified` instead.
 * The endpoint stays fully live (revalidated every poll) while egress drops to
 * ~0 bytes when the payload is unchanged, the common case between turns.
 *
 * SAFE FOR PER-USER DATA: the response is recomputed per request and never
 * written to a shared cache. `Cache-Control` stays `private`, so only the
 * user's own browser may revalidate it; there is no cross-user cache key to
 * leak through (unlike shared edge caching, reserved for global data).
 *
 * `private, no-cache` (revalidate every time) is used rather than `no-store`
 * on purpose: `no-store` forbids the browser from issuing the conditional
 * request at all, which would defeat the 304.
 */
export function conditionalJson(
  request: Request,
  data: unknown,
  init: { cacheControl?: string; status?: number; headers?: Record<string, string> } = {}
): NextResponse {
  const body = JSON.stringify(data);
  const etag = `"${createHash("sha1").update(body).digest("hex")}"`;
  // `no-transform` keeps Cloudflare from re-compressing the body with zstd,
  // whose Content-Encoding some Android WebView builds fail to decode (client
  // fetch() then throws a "Network error"). It does not affect cacheability or
  // the ETag/304 revalidation this helper exists for. It does, however, suppress
  // origin and edge compression as well, so a body that
  // needs encoding must be compressed in the handler — see jsonCompression.ts.
  const cacheControl = `${init.cacheControl ?? "private, no-cache"}, no-transform`;

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ...init.headers, ETag: etag, "Cache-Control": cacheControl },
    });
  }

  return new NextResponse(body, {
    status: init.status ?? 200,
    headers: {
      ...init.headers,
      "Content-Type": "application/json",
      ETag: etag,
      "Cache-Control": cacheControl,
    },
  });
}
