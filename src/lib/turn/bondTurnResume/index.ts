/**
 * Shell for rebuilding an interrupted bondTurn's sovereign flows. bondTurn
 * records its at-par snapshot here; a later read of the checkpoint plus the
 * journal's primary receipts feeds the rules in ./rules.
 */
import type { Db } from "mongodb";
import { resumeSettlement } from "@/lib/banking/settlementJournal";
import { refreshSovereignDebtTerms } from "@/lib/bonds/sovereign";
import type { Bond, FederalBudget } from "@/lib/db/types";
import {
  rebuildInterruptedBondTurnFlows,
  type BondTurnFlowRebuild,
  type PrimaryReceiptEvidence,
} from "./rules";

export const BOND_TURN_CHECKPOINTS = "bondTurnCheckpoints";
/** Checkpoints older than this many turns are deleted when a new one is written. */
const RETAINED_TURNS = 48;

export interface BondTurnCheckpoint {
  /** The turn number. */
  _id: number;
  atParIssues: { countryId: string; face: number }[];
  createdAt: Date;
}

/**
 * Persist bondTurn's at-par snapshot before the placement sweep can add cash to
 * the same bonds. One write per turn, plus the bounded retention delete.
 */
export async function recordBondTurnCheckpoint(
  db: Db,
  turn: number,
  atParIssues: readonly { countryId: string; face: number }[],
  now: Date
): Promise<void> {
  const checkpoints = db.collection<BondTurnCheckpoint>(BOND_TURN_CHECKPOINTS);
  await Promise.all([
    checkpoints.replaceOne(
      { _id: turn },
      { atParIssues: atParIssues.map((issue) => ({ ...issue })), createdAt: now },
      { upsert: true }
    ),
    checkpoints.deleteMany({ _id: { $lt: turn - RETAINED_TURNS } }),
  ]);
}

interface StoredMove {
  _id: string;
  status?: string;
  legs?: {
    kind?: string;
    collection?: string;
    amount?: unknown;
    applied?: boolean;
    filter?: { _id?: unknown };
  }[];
  projections?: {
    collection?: string;
    applied?: boolean;
    projection?: {
      update?: { $inc?: Record<string, unknown> };
      insert?: { countryId?: unknown };
    };
  }[];
}

function receiptEvidence(move: StoredMove): PrimaryReceiptEvidence {
  const legs = move.legs ?? [];
  const projections = move.projections ?? [];
  const credit = legs.find((leg) => leg.kind === "credit" && leg.collection === "federalBudget");
  const face = projections.find((row) => row.collection === "federalBudget")?.projection?.update
    ?.$inc?.["debt.principal"];
  const countryId = projections.find((row) => row.collection === "financialTxLog")?.projection
    ?.insert?.countryId;
  return {
    key: move._id,
    status: move.status ?? "unknown",
    anyApplied: legs.some((leg) => leg.applied) || projections.some((row) => row.applied),
    countryId: typeof countryId === "string" ? countryId : null,
    cashPaid: typeof credit?.amount === "number" ? credit.amount : null,
    face: typeof face === "number" ? face : null,
  };
}

/**
 * The sovereign flows an interrupted bondTurn committed for `turn`, or the
 * reason they cannot be proven. Reads run only after the phase has stopped.
 */
export async function rebuildBondTurnFlowsFromJournal(
  db: Db,
  turn: number,
  options: { treasuryCashLedgerEnabled: boolean }
): Promise<BondTurnFlowRebuild> {
  const readReceipts = () =>
    db
      .collection<StoredMove>("bankMoneyMoves")
      .find(
        { _id: { $regex: `^sovereign-primary:(scheduled|placement):[^:]+:${turn}$` } },
        { projection: { _id: 1, status: 1, legs: 1, projections: 1 } }
      )
      .toArray();
  const [checkpoint, firstRead] = await Promise.all([
    db.collection<BondTurnCheckpoint>(BOND_TURN_CHECKPOINTS).findOne({ _id: turn }),
    readReceipts(),
  ]);
  // The phase has stopped, so a receipt it left mid-journal has no live
  // writer. Finish it from its record exactly as settlement recovery would;
  // one that still cannot finish is refused by the rules below.
  const unfinished = firstRead.filter(
    (move) => move.status !== "applied" && move.status !== "rejected"
  );
  for (const move of unfinished) await resumeSettlement(db, move._id);
  const receipts = unfinished.length > 0 ? await readReceipts() : firstRead;
  // bondTurn refreshes a budget's derived debt terms after each placement. The
  // dead phase may have stopped between a placement and its refresh; the
  // refresh is a pure recompute from the budget, so repeat it for every budget
  // a placement credited this turn.
  const placedBudgets = new Set<string>();
  for (const move of receipts) {
    if (move.status !== "applied" || !move._id.startsWith("sovereign-primary:placement:")) continue;
    const budgetId = move.legs?.find(
      (leg) => leg.kind === "credit" && leg.collection === "federalBudget"
    )?.filter?._id;
    if (typeof budgetId === "string") placedBudgets.add(budgetId);
  }
  for (const budgetId of placedBudgets) {
    await refreshSovereignDebtTerms(db, budgetId as FederalBudget["_id"]);
  }
  const issuedThisTurn = checkpoint
    ? []
    : (
        await db
          .collection<Bond>("bonds")
          .find(
            { issuerType: "sovereign", issuedAtTurn: turn, reconcile: { $ne: true } },
            { projection: { countryId: 1, totalIssued: 1 } }
          )
          .toArray()
      ).map((bond) => ({ countryId: bond.countryId ?? null, face: bond.totalIssued }));
  const evidence = receipts.map(receiptEvidence);
  return rebuildInterruptedBondTurnFlows({
    turn,
    treasuryCashLedgerEnabled: options.treasuryCashLedgerEnabled,
    checkpoint: checkpoint ? { atParIssues: checkpoint.atParIssues } : null,
    issuedThisTurn,
    scheduledReceipts: evidence.filter((row) => row.key.startsWith("sovereign-primary:scheduled:")),
    placementReceipts: evidence.filter((row) => row.key.startsWith("sovereign-primary:placement:")),
  });
}
