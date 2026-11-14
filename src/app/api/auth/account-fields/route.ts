import { NextResponse } from "next/server";
import { getAccountFieldsMode, getUsernameMode } from "@/lib/auth/accountFields/mode";

// GET /api/auth/account-fields: Whether email and password changes happen here or at the Lakeside account.
// Auth: public
// Errors: none
export async function GET() {
  return NextResponse.json(
    { mode: getAccountFieldsMode(), usernameMode: getUsernameMode() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
