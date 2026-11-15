/**
 * Require admin auth for API route handlers.
 * Use at the start of admin route handlers.
 *
 * Admins pass on every method. Junior devs (read-only staff) pass on GET and
 * HEAD only; any other method, or an unknown one, is a 403.
 * @returns Admin user on success, or 403 NextResponse on failure
 */
import { NextResponse } from "next/server";
import { getAuthAdmin, getAuthJuniorDev } from "@/lib/auth";
import { forbidden } from "@/lib/api/errors";
import type { AuthUserWithCharacter } from "@/lib/auth";
import { currentRequestMethod } from "@/lib/staff/requestMethod";
import { isReadMethod } from "@/lib/staff/rules";

export type AdminAuthResult =
  { ok: true; admin: AuthUserWithCharacter } | { ok: false; response: NextResponse };

export async function requireAdmin(): Promise<AdminAuthResult> {
  const admin = await getAuthAdmin();
  if (admin) return { ok: true, admin };

  const juniorDev = await getAuthJuniorDev();
  if (juniorDev && isReadMethod(await currentRequestMethod())) {
    return { ok: true, admin: juniorDev };
  }
  return { ok: false, response: NextResponse.json(forbidden().toJson(), { status: 403 }) };
}
