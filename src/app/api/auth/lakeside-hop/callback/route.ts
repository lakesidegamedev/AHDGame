import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { finishLakesideHop } from "@/lib/auth/centralLogin/hop";
import { getBaseUrl } from "@/lib/utils/network";

// GET /api/auth/lakeside-hop/callback: Finishes the Lakeside session hop and returns the browser to where it was going.
// Auth: public (signs nobody in; the player already holds an AHD session)
// Errors: none, every failure still redirects
export async function GET(request: Request) {
  const url = new URL(request.url);
  // Behind the proxy, request.url carries the server's own listen address, so
  // the public origin comes from configuration.
  const origin = getBaseUrl(request);
  const destination = await finishLakesideHop({
    query: url.searchParams,
    cookieStore: await cookies(),
    fallbackOrigin: origin,
  });
  const response = NextResponse.redirect(new URL(destination, origin));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
