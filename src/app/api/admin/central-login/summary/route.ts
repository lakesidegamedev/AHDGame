import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { errorResponse, handleRouteError } from "@/lib/api/errors";
import { summarizeShadowEvents } from "@/lib/auth/centralLogin/shadowEvents";

const WINDOWS_MS: Record<string, number> = {
  "1h": 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
};

// GET /api/admin/central-login/summary: Central login shadow event counts for a window (window=1h|24h|7d, default 24h).
// Auth: requireAdmin
// Errors: 400, 403
export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const window = new URL(request.url).searchParams.get("window") ?? "24h";
    const windowMs = WINDOWS_MS[window];
    if (!windowMs) return errorResponse(400, "window must be 1h, 24h or 7d");

    const summary = await summarizeShadowEvents(windowMs);
    return NextResponse.json({ window, summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
