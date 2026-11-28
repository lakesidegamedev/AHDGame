import { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { withTurnValueSettlement } from "@/lib/turn/withTurnValueSettlement";
import { getCurrentTurn } from "@/lib/currentTurn";
import { errorResponse } from "@/lib/api/errors";

/** Store a JSON action outcome with its money legs so a lost reply can be retried. */
export async function recordedCasinoResponse(
  db: Db,
  key: string,
  request: unknown,
  work: (db: Db) => Promise<Response>
): Promise<Response> {
  const fingerprint = JSON.stringify(request);
  const outcome = await withTurnValueSettlement(
    db,
    "casino-command",
    await getCurrentTurn(db),
    async (db) => {
      const response = await work(db);
      return { fingerprint, status: response.status, body: (await response.json()) as unknown };
    },
    { sourceKey: key }
  );
  if (outcome.fingerprint !== fingerprint)
    return errorResponse(409, "This casino action was already accepted with different details.");
  return NextResponse.json(outcome.body, { status: outcome.status });
}
