import { AtomicResultRefused } from "@/lib/db/withAtomicResult";
import type { Db } from "mongodb";
import { withSessionDb, boundSession } from "@/lib/db/sessionDb";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { errorResponse } from "./errors";

class CommandRefused extends Error {
  constructor(readonly response: Response) {
    super("Economic command refused");
  }
}

/** Fence turn acquisition and roll back every rejected multi-document command. */
export async function withAtomicEconomicCommand(
  db: Db,
  work: (transactionDb: Db) => Promise<Response>
): Promise<Response> {
  try {
    return await withSessionDb(db, async (transactionDb) => {
      const refusal = await fenceEconomicTurn(transactionDb);
      if (refusal) throw new CommandRefused(errorResponse(refusal.status, refusal.error));
      const response = await work(transactionDb);
      if (!response.ok) throw new CommandRefused(response);
      return response;
    });
  } catch (error) {
    if (error instanceof CommandRefused && !boundSession(db)) return error.response;
    if (error instanceof AtomicResultRefused && !boundSession(db)) {
      const outer = error.result as Record<string, unknown>;
      const result = (
        outer.result && typeof outer.result === "object" ? outer.result : outer
      ) as Record<string, unknown>;
      const detail =
        result.error && typeof result.error === "object"
          ? (result.error as Record<string, unknown>)
          : undefined;
      const status =
        typeof result.status === "number"
          ? result.status
          : typeof detail?.status === "number"
            ? detail.status
            : 400;
      const message =
        typeof result.error === "string"
          ? result.error
          : typeof detail?.message === "string"
            ? detail.message
            : typeof result.reason === "string"
              ? result.reason
              : "The command was refused.";
      return errorResponse(status, message);
    }
    throw error;
  }
}

/** Must join a transaction so turn acquisition conflicts with the command's writes. */
export async function fenceEconomicTurn(
  db: Db
): Promise<{ ok: false; status: 409; error: string } | null> {
  if (!boundSession(db)) throw new Error("Economic turn fence requires a transaction");
  const state = await gameStateCollection(db).findOne(
    { _id: "current" },
    {
      projection: {
        currentTurn: 1,
        worldEpochId: 1,
        isProcessing: 1,
        processingKind: 1,
        resetAdmissionId: 1,
      },
    }
  );
  if (
    !state ||
    state.isProcessing ||
    state.resetAdmissionId != null ||
    state.processingKind === "economyReset" ||
    state.processingKind === "stockTaxMigration"
  )
    return {
      ok: false,
      status: 409,
      error: "The game is processing or recovering a turn. Try again shortly.",
    };
  const fence = await gameStateCollection(db).updateOne(
    {
      _id: "current",
      isProcessing: { $ne: true },
      resetAdmissionId: null,
      currentTurn: state.currentTurn,
      ...(state.worldEpochId != null
        ? { worldEpochId: state.worldEpochId }
        : {
            $or: [
              { worldEpochId: { $exists: false } },
              { worldEpochId: { $type: "null" as const } },
            ],
          }),
    },
    { $inc: { economicCommandRevision: 1 }, $set: { updatedAt: new Date() } }
  );
  if (fence.matchedCount !== 1)
    return { ok: false, status: 409, error: "The game advanced. Refresh and try again." };
  return null;
}
