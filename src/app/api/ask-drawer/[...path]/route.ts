import { NextResponse, type NextRequest } from "next/server";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { errorResponse, handleRouteError } from "@/lib/api/errors";
import { withNoStore } from "@/lib/api/withNoStore";
import {
  askDrawerBodyLimit,
  askDrawerRoute,
  askServiceConfig,
  askUpstreamPath,
} from "@/lib/askDrawer/askService";

// GET|POST /api/ask-drawer/<route> — The Ask drawer's connection to the Ask service
// Auth: requireBasicAuth. Forwards to Ask /api/game-ask/<route> as the signed-in player,
// or to Ask's chart and map renderers for chart/render and map/render.
// Errors: 400, 401, 413, 429, 503, plus Ask's own statuses passed through

// A deep answer can stream for minutes; Ask enforces its own deadline.
export const maxDuration = 300;

type Ctx = { params: Promise<{ path?: string[] }> };

async function forward(request: NextRequest, ctx: Ctx): Promise<Response> {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    const route = askDrawerRoute((await ctx.params).path);
    if (!route) return errorResponse(400, "Unknown Ask route.");

    const config = askServiceConfig();
    if (!config) return errorResponse(503, "Ask is not available here yet.");

    const rateLimit = checkRateLimit(`ask-drawer:${auth.user.userId}`, 60, 60000);
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    let body: string | undefined;
    if (request.method === "POST") {
      body = await request.text();
      if (body.length > askDrawerBodyLimit(route)) return errorResponse(413, "Request too large.");
    }

    let upstream: Response;
    try {
      upstream = await fetch(
        `${config.baseUrl}${askUpstreamPath(route)}${request.nextUrl.search}`,
        {
          method: request.method,
          headers: {
            Authorization: `Bearer ${config.secret}`,
            "X-Ask-User-Id": auth.user.userId,
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body,
          cache: "no-store",
          signal: request.signal,
        }
      );
    } catch (error) {
      console.warn("[ask-drawer] Ask service unreachable", error);
      return errorResponse(503, "Ask is not responding. Try again in a moment.");
    }

    const contentType = upstream.headers.get("content-type") ?? "application/json";
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store, no-transform",
    };
    if (contentType.includes("text/event-stream")) headers["X-Accel-Buffering"] = "no";
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withNoStore(forward);
export const POST = withNoStore(forward);
