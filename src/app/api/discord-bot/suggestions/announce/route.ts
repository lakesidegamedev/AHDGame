import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireBotToken } from "@/lib/api/requireBotToken";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { announcePendingSuggestionCompletions } from "@/lib/suggestions/completionAnnouncement";

// POST /api/discord-bot/suggestions/announce — Post every completed suggestion
// that has not been announced yet. Support tooling calls this right after it
// marks a suggestion done, so the post does not wait for the next turn.
// Idempotent: each suggestion is claimed once, so repeat calls post nothing new.
// Auth: requireBotToken (private key only)
// Errors: 401
export async function POST(request: Request) {
  try {
    if (!requireBotToken(request, false)) {
      return errorResponse(401, "Unauthorized");
    }
    const db = await getDb();
    const posted = await announcePendingSuggestionCompletions(db);
    return NextResponse.json({ posted });
  } catch (err) {
    return handleRouteError(err);
  }
}
