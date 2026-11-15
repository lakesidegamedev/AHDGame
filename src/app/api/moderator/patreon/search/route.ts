import { NextResponse } from "next/server";
import { requireModerator } from "@/lib/api/requireModerator";
import { handleRouteError } from "@/lib/api/errors";
import { searchPatreonUsers } from "@/lib/patreon/staffUserSearch";

// GET /api/moderator/patreon/search — Search users for Patreon management UI.
// Auth: requireModerator
// Errors: 403
export async function GET(request: Request) {
  try {
    const auth = await requireModerator();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const users = await searchPatreonUsers(
      searchParams.get("q")?.trim() ?? "",
      searchParams.get("characterId") ?? "",
      { excludeAdmins: true }
    );
    return NextResponse.json({ users });
  } catch (error) {
    return handleRouteError(error);
  }
}
