import { NextResponse } from "next/server";
import { getPatreonTierPrices } from "@/lib/patreon/tierPrices";
import { HELP_PATREON_URL } from "@/components/navbar/helpLinks";

// GET /api/patreon/tiers — Paid Patreon tiers at their current price
// Auth: public (no user data). Also read by the Ask service.
export async function GET() {
  const tiers = await getPatreonTierPrices();
  return NextResponse.json(
    { url: process.env.NEXT_PUBLIC_PATREON_URL ?? HELP_PATREON_URL, tiers },
    { headers: { "Cache-Control": "public, max-age=600, s-maxage=600" } }
  );
}
