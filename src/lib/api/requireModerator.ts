/**
 * Require moderator or admin auth for API route handlers.
 * Accepts users with role "moderator" or "admin". Junior devs (read-only
 * staff) pass on GET and HEAD only.
 * @returns Moderator/admin user on success, or 403 NextResponse on failure
 */
import { NextResponse } from "next/server";
import { getAuthModerator, getAuthJuniorDev } from "@/lib/auth";
import { forbidden } from "@/lib/api/errors";
import type { AuthUserWithCharacter } from "@/lib/auth";
import { currentRequestMethod } from "@/lib/staff/requestMethod";
import { isReadMethod } from "@/lib/staff/rules";

export type ModeratorAuthResult =
  { ok: true; user: AuthUserWithCharacter } | { ok: false; response: NextResponse };

export async function requireModerator(): Promise<ModeratorAuthResult> {
  const user = await getAuthModerator();
  if (user) return { ok: true, user };

  const juniorDev = await getAuthJuniorDev();
  if (juniorDev && isReadMethod(await currentRequestMethod())) {
    return { ok: true, user: juniorDev };
  }
  return { ok: false, response: NextResponse.json(forbidden().toJson(), { status: 403 }) };
}
