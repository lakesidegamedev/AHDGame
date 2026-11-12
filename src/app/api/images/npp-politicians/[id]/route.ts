/**
 * NPP politician portrait image route.
 * Serves the portrait bytes for an opaque portrait token (or a legacy pool id).
 *
 * Proxies rather than redirects so the response never carries the upstream
 * file name, which usually names the person pictured.
 *
 * Auth:   Public (used as an <img src>)
 * Cache:  7 days
 * Errors: 404 if the id is not in the pool; 502 if the source is unavailable
 */

import { NextResponse } from "next/server";
import { resolvePortraitSource } from "@/lib/npp/portraitTokens";

const UPSTREAM_TIMEOUT_MS = 8000;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const source = resolvePortraitSource(id);

  if (!source) {
    return new NextResponse("Not Found", { status: 404 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(source, {
      headers: { "User-Agent": "AHouseDivided/1.0 (portrait proxy)" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return new NextResponse("Bad Gateway", { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !upstream.body || !contentType.startsWith("image/")) {
    return new NextResponse("Bad Gateway", { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
