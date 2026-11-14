import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError } from "@/lib/api/errors";
import { getDb } from "@/lib/mongodb";
import { getAccountFieldsStatus } from "@/lib/auth/accountFields/consumer";

// GET /api/admin/account-fields: Account-fields mode, feed cursor, last poll, last error and how many accounts have no local password.
// Auth: requireAdmin
// Errors: 403
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const status = await getAccountFieldsStatus(await getDb());
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
