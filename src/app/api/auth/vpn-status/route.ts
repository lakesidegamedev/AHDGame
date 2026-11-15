import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/errors";
import { getAuthUser } from "@/lib/auth";
import { getClientIp } from "@/lib/utils/network";
import { classifyIp } from "@/lib/vpn/detection";
import { isVpnGated } from "@/lib/vpn/gate";

// GET /api/auth/vpn-status - Whether the signed-in player's game actions are
// currently blocked by the VPN gate. Drives the VPN banner.
// Auth: optional (signed-out viewers are never gated)
export async function GET() {
  try {
    const user = await getAuthUser();
    const gated = user ? isVpnGated(user, await classifyIp(await getClientIp())) : false;
    return NextResponse.json({ gated }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
