import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { handleRouteError } from "@/lib/api/errors";
import { checkWikiDisabled } from "@/lib/api/wikiGuard";
import { roadmapItemsCollection } from "@/lib/db/repositories/roadmapItems";
import type { Document } from "mongodb";
import { roadmapCategoriesCollection } from "@/lib/db/repositories/roadmapCategories";

// GET /api/roadmap — Returns all public roadmap items and categories.
// Auth: public
// Errors: (none)
export async function GET() {
  try {
    const blocked = await checkWikiDisabled();
    if (blocked) return blocked;

    const db = await getDb();
    const [items, categories] = await Promise.all([
      roadmapItemsCollection<Document>(db).find({}).sort({ phase: 1, sortOrder: 1 }).toArray(),
      roadmapCategoriesCollection<Document>(db).find({}).sort({ sortOrder: 1 }).toArray(),
    ]);

    return NextResponse.json({ items, categories });
  } catch (err) {
    return handleRouteError(err);
  }
}
