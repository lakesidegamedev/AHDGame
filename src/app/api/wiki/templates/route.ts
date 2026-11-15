import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { handleRouteError } from "@/lib/api/errors";
import { checkWikiDisabled } from "@/lib/api/wikiGuard";
import type { WikiTemplate } from "@/lib/db/types";
import { wikiTemplatesCollection } from "@/lib/db/repositories/wikiTemplates";

// GET /api/wiki/templates — Returns all available wiki page templates.
// Auth: public; blocked when wiki is disabled
// Errors: 403
export async function GET() {
  try {
    const blocked = await checkWikiDisabled();
    if (blocked) return blocked;
    const db = await getDb();
    const templates = await wikiTemplatesCollection(db)
      .find({})
      .sort({ name: 1 })
      .limit(200)
      .toArray();

    return NextResponse.json(
      { templates },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600, no-transform",
        },
      }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
