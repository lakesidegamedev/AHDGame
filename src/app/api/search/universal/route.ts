import { NextResponse } from "next/server";
import { withNoStore } from "@/lib/api/withNoStore";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { getAuthUser } from "@/lib/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { getClientIp } from "@/lib/utils/network";
import {
  MAX_UNIVERSAL_SEARCH_QUERY_LENGTH,
  runUniversalSearch,
} from "@/lib/search/universalSearch";

// GET /api/search/universal — Searches across politicians, NPPs, elected seats, and active elections by query string.
// Auth: public
// Errors: 400 when q exceeds 200 characters
async function handleGET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() || "";
    const isResultsPage = searchParams.get("view") === "page";

    // BSON regex serialization rejects null bytes before MongoDB can run the query.
    if (query.includes("\u0000")) {
      return errorResponse(400, "Query contains an invalid character");
    }

    // Return empty results for empty or too-short queries. A 1-character query
    // forces a near-full scan of every searched collection.
    if (query.length < 2) {
      return NextResponse.json({ results: [] });
    }

    // Cap query length: an unbounded `q` becomes an unbounded regex scanned
    // across many large collections.
    if (query.length > MAX_UNIVERSAL_SEARCH_QUERY_LENGTH) {
      return errorResponse(
        400,
        `Query too long (max ${MAX_UNIVERSAL_SEARCH_QUERY_LENGTH} characters)`
      );
    }

    const authUser = await getAuthUser();
    const isAdmin = authUser?.isAdmin === true;
    const isModerator = authUser?.isModerator === true;

    // Rate limit: this endpoint runs case-insensitive regex across many large
    // collections (an expensive scan), so cap requests per user — or per IP when
    // unauthenticated — to prevent DoS amplification.
    const rateLimitKey = authUser?.userId ?? `ip:${await getClientIp()}`;
    const searchRate = checkRateLimit(`search:${rateLimitKey}`, 30, 60_000);
    if (!searchRate.ok) {
      return rateLimitResponse(searchRate.retryAfter);
    }

    const results = await runUniversalSearch({ query, isResultsPage, isAdmin, isModerator });
    return NextResponse.json({ results });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withNoStore(handleGET);
