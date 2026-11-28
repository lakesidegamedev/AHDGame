import { NextResponse } from "next/server";
import { ObjectId, type Db } from "mongodb";
import { withAtomicEconomicCommand } from "./withAtomicEconomicCommand";
import { withTurnValueSettlement } from "@/lib/turn/withTurnValueSettlement";
import { getCurrentTurn } from "@/lib/currentTurn";
import { errorResponse, badRequest } from "./errors";

/** Commit the reply with its money legs; retries must keep the same request identity. */
export async function withRecordedEconomicCommand(
  db: Db,
  namespace: string,
  actorId: string,
  requestId: string | undefined,
  input: unknown,
  work: (db: Db) => Promise<Response>
): Promise<Response> {
  const key = `${actorId}:${requestId ?? new ObjectId().toHexString()}`;
  const fingerprint = JSON.stringify(input);
  return withAtomicEconomicCommand(db, async (db) => {
    const outcome = await withTurnValueSettlement(
      db,
      namespace,
      await getCurrentTurn(db),
      async (db) => {
        const response = await work(db);
        return { fingerprint, status: response.status, body: (await response.json()) as unknown };
      },
      { sourceKey: key }
    );
    if (outcome.fingerprint !== fingerprint)
      return errorResponse(409, "This request was already accepted with different details.");
    return NextResponse.json(outcome.body, { status: outcome.status });
  });
}

/** Reject malformed intent identities before executing a paid command. */
export function economicRequestId(request: Request): string | undefined {
  const key = request.headers.get("Idempotency-Key");
  if (key === null) return undefined;
  if (!/^[a-zA-Z0-9:_-]{1,120}$/.test(key)) throw badRequest("Invalid request identity");
  return key;
}
