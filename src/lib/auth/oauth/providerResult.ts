import { NextResponse } from "next/server";
import type { OAuthProvider } from "./types";

/** Result page URL in the `status, reason, next` shape the Discord and Google callbacks use. */
export function providerResultUrl(
  provider: OAuthProvider,
  baseUrl: string,
  status: string,
  next: string,
  reason?: string
): URL {
  const reasonPart = reason ? `&reason=${reason}` : "";
  return new URL(
    `/auth/${provider}/result?status=${status}${reasonPart}&next=${encodeURIComponent(next)}`,
    baseUrl
  );
}

/** Link-flow redirects carry per-account outcomes, so they are never cached. */
export function noStoreRedirect(url: URL): NextResponse {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
