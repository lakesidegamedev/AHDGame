import { NextResponse } from "next/server";
import { requireSingleplayer } from "@/lib/api/requireSingleplayer";
import { buildSingleplayerCapabilities } from "@/lib/singleplayer/capabilities";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = requireSingleplayer(request);
  if (denied) return denied;
  return NextResponse.json(buildSingleplayerCapabilities(), {
    headers: { "Cache-Control": "no-store" },
  });
}
