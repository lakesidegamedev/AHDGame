import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { recordHopSkipped, sessionUserId } from "@/lib/auth/centralLogin/hop";
import { isHopIssuerReady } from "@/lib/auth/centralLogin/issuerReadiness";
import { getCentralLoginMode } from "@/lib/auth/centralLogin";

// GET /api/auth/lakeside-hop/ready: Tells the login page whether the central issuer answers, so it can skip the hop instead of showing a dead page.
// Auth: public (reveals only reachability)
// Errors: none, failures report ready: false
export async function GET() {
  const ready = await isHopIssuerReady();
  if (!ready && getCentralLoginMode() === "central") {
    const userId = (await sessionUserId(await cookies())) ?? "";
    await recordHopSkipped(userId);
  }
  return NextResponse.json({ ready }, { headers: { "Cache-Control": "no-store" } });
}
