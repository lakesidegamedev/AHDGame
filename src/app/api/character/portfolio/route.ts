import { requireBasicAuth } from "@/lib/api/requireAuth";
import { handleRouteError } from "@/lib/api/errors";
import { compressedJson } from "@/lib/api/jsonCompression";
import { loadCharacterPortfolio } from "@/lib/portfolio/loadCharacterPortfolio";

// Per-user response keyed only to the session cookie (no id in the path), so
// every user hits the same URL. Without no-store a URL-keyed CDN/edge cache can
// serve one player's holdings to another ("my assets showing someone else's").
const PORTFOLIO_CACHE_HEADERS = { "Cache-Control": "no-store, no-transform" } as const;

// GET /api/character/portfolio — Returns the authenticated character's stock holdings, bond holdings, and portfolio history
// Query: ?summary=1 omits the 500-row history chart (the four scalar totals remain)
// Auth: requireBasicAuth
// Errors: 401
export async function GET(request: Request) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;
    const summary = new URL(request.url).searchParams.get("summary") === "1";
    return compressedJson(request, await loadCharacterPortfolio(auth.user.userId, { summary }), {
      headers: PORTFOLIO_CACHE_HEADERS,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
