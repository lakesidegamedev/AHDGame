import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { finishLakesideHop } from "@/lib/auth/centralLogin/hop";

// GET /api/auth/lakeside-hop/callback: Finishes the Lakeside session hop and returns the browser to where it was going.
// Auth: public (signs nobody in; the player already holds an AHD session)
// Errors: none, every failure still redirects
export async function GET(request: Request) {
  const url = new URL(request.url);
  const destination = await finishLakesideHop({
    query: url.searchParams,
    cookieStore: await cookies(),
    fallbackOrigin: url.origin,
  });
  const response = NextResponse.redirect(new URL(destination, url.origin));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
