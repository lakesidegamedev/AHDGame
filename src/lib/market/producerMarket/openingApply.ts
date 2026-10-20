/**
 * Applies a reviewed producer opening plan to the live world (funded-market
 * cutover, phase B slice S1).
 *
 * The plan is built by `scripts/migrations/captureProducerOpening.ts` from the
 * live world at an idle turn boundary. This writes exactly that plan:
 * - only when its digest matches the census an operator reviewed;
 * - idempotently: every write is filtered on "not yet opened, or opened by this
 *   same generation", so a re-run after a crash finishes the job and a second
 *   full run changes nothing;
 * - stamping `gameState.producerOpening` last, after every sector and company
 *   is verified. The funded path refuses to start without that marker.
 *
 * It never creates cash or input stock (the plan guarantees both are zero) and
 * refuses any unresolved modeled-loss carry.
 */
import { ObjectId, type Db } from "mongodb";
import type { ProducerOpeningPlan } from "./migrationRules";
import type { ProducerOpeningMarker } from "./liveMode";

export const PRODUCER_OPENINGS = "producerOpenings";

export interface ProducerOpeningApplyResult {
  status: "applied" | "alreadyApplied";
  sectors: number;
  corporations: number;
  modeledLossCleared: number;
}

const oid = (id: string) => (ObjectId.isValid(id) ? new ObjectId(id) : id);

export async function applyProducerOpening(
  db: Db,
  input: { plan: ProducerOpeningPlan; planDigest: string; approvedDigest: string }
): Promise<ProducerOpeningApplyResult> {
  const { plan } = input;
  if (!input.approvedDigest || input.planDigest !== input.approvedDigest)
    throw new Error("Opening plan does not match the reviewed census digest");
  if (plan.unresolvedModeledLossCarry.length > 0)
    throw new Error("Opening plan has unresolved modeled-loss carry");
  if (plan.reconciliation.cashCreated !== 0 || plan.reconciliation.inputStockCreated !== 0)
    throw new Error("Opening plan would create cash or input stock");

  const marker: ProducerOpeningMarker = {
    worldEpoch: plan.worldEpoch,
    turn: plan.completedTurn,
    digest: input.planDigest,
  };
  const state = await db
    .collection<{ _id: string; producerOpening?: ProducerOpeningMarker; worldEpochId?: string }>(
      "gameState"
    )
    .findOne({ _id: "current" }, { projection: { producerOpening: 1, worldEpochId: 1 } });
  if (state?.worldEpochId !== plan.worldEpoch)
    throw new Error("Opening plan is for a different world");
  const existing = state?.producerOpening;
  if (existing) {
    if (
      existing.worldEpoch === marker.worldEpoch &&
      existing.turn === marker.turn &&
      existing.digest === marker.digest
    )
      return {
        status: "alreadyApplied",
        sectors: plan.sectors.length,
        corporations: plan.accounts.length,
        modeledLossCleared: 0,
      };
    throw new Error("A different producer opening is already applied to this world");
  }

  const generation = { worldEpoch: plan.worldEpoch, turn: plan.completedTurn };
  const openOrSame = (field: string) => ({
    $or: [
      { [field]: { $exists: false } },
      { [`${field}.worldEpoch`]: generation.worldEpoch, [`${field}.turn`]: generation.turn },
    ],
  });

  await db.collection(PRODUCER_OPENINGS).updateOne(
    { _id: input.planDigest as never },
    {
      $setOnInsert: {
        _id: input.planDigest,
        ...generation,
        firstSettlementTurn: plan.firstSettlementTurn,
        reconciliation: plan.reconciliation,
        nonCashOpeningAdjustments: plan.nonCashOpeningAdjustments,
        openingQuoteAdjustments: plan.openingQuoteAdjustments,
        protectedImages: plan.protectedImages,
        startedAt: new Date(),
      },
    },
    { upsert: true }
  );

  if (plan.sectors.length > 0) {
    const result = await db.collection("corporateSectors").bulkWrite(
      plan.sectors.map((sector) => {
        const quotes: Record<string, unknown> = {};
        for (const q of sector.quotes) if (!(q.commodity in quotes)) quotes[q.commodity] = q.policy;
        return {
          updateOne: {
            filter: { _id: oid(sector.id), ...openOrSame("producerInventory") } as never,
            update: {
              $set: {
                producerCapacity: generation,
                producerInventory: {
                  ...generation,
                  inputStock: [],
                  outputStock: sector.outputStock,
                },
                producerQuotes: quotes,
              },
            },
          },
        };
      }),
      { ordered: false }
    );
    if (result.matchedCount !== plan.sectors.length)
      throw new Error(
        `Opening matched ${result.matchedCount} of ${plan.sectors.length} sectors; a sector changed or holds another generation`
      );
  }

  if (plan.accounts.length > 0) {
    const result = await db.collection("corporations").bulkWrite(
      plan.accounts.map((account) => ({
        updateOne: {
          filter: { _id: oid(account.id), ...openOrSame("producerPayables") } as never,
          update: { $set: { producerPayables: account.producerPayables } },
        },
      })),
      { ordered: false }
    );
    if (result.matchedCount !== plan.accounts.length)
      throw new Error(
        `Opening matched ${result.matchedCount} of ${plan.accounts.length} corporations`
      );
  }

  // Modeled operating-loss carry is not a debt to anyone; the plan records it as
  // an approved non-cash opening adjustment (kept in producerOpenings above).
  const cleared = plan.nonCashOpeningAdjustments.map((a) => oid(a.accountId));
  if (cleared.length > 0)
    await db.collection("corporations").updateMany({ _id: { $in: cleared } } as never, {
      $unset: { operatingCashArrearsByCurrency: "" },
    });

  const opened = await db.collection("corporateSectors").countDocuments({
    "producerInventory.worldEpoch": generation.worldEpoch,
    "producerInventory.turn": generation.turn,
  });
  if (opened !== plan.sectors.length)
    throw new Error(`Opening verified ${opened} of ${plan.sectors.length} sectors`);

  const stamped = await db
    .collection<{ _id: string }>("gameState")
    .updateOne(
      { _id: "current", worldEpochId: plan.worldEpoch, producerOpening: { $exists: false } },
      { $set: { producerOpening: marker } }
    );
  if (stamped.matchedCount !== 1) throw new Error("Opening marker could not be stamped");
  await db
    .collection(PRODUCER_OPENINGS)
    .updateOne({ _id: input.planDigest as never }, { $set: { completedAt: new Date() } });
  return {
    status: "applied",
    sectors: plan.sectors.length,
    corporations: plan.accounts.length,
    modeledLossCleared: cleared.length,
  };
}
