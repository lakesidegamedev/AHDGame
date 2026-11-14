import { buildStaticLandingHtml } from "@/lib/landing/static/buildStaticLanding";

export const dynamic = "force-dynamic";

/**
 * Internal target of the signed-out `/` rewrite in `src/proxy.ts`. The proxy
 * stamps `x-pathname` with the path the visitor asked for, so a direct request
 * to this URL (where the stamp is `/landing-static`) is a 404, not a duplicate
 * of the home page.
 */
export async function GET(request: Request) {
  if (request.headers.get("x-pathname") !== "/") {
    return new Response("Not found", { status: 404 });
  }
  const html = await buildStaticLandingHtml();
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate",
    },
  });
}
