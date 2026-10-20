/**
 * One attempt to split whole plants off a rival's sector (plants economy).
 *
 * Shared by the player route and the autonomous NPP attack pass so both run
 * the same rule: the attacker's marketing strength against the defender's sets
 * the share (1% up to 20% of the defender's plants) and the odds, and on
 * success the plants move intact to the attacker. Cash and MS are
 * spent either way. See `calculatePlantSectorSplit` for the quote.
 */
import type { Db, ObjectId } from "mongodb";
import { getMongoClient } from "@/lib/mongodb";
import { runTransactionWithSessionRetry } from "@/lib/db/transactionWithRetry";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import type { CurrencyCode } from "@/lib/constants/currencies";
import {
  DEFAULT_PROFIT_MARGIN,
  DEFAULT_SECTOR_STARTING_WORKERS,
  type CorporationType,
  type OperatingSectorType,
} from "@/lib/constants/corporations";
import { roundMarketingStrength } from "@/lib/utils/formatters";
import {
  anchorToCorpLiquidCapital,
  corpLiquidCapitalToAnchor,
} from "@/lib/currency/corporationCapital";
import { insufficientCapitalMessage } from "@/lib/currency/insufficientCapitalMessage";
import { isCorporateSectorDuplicateKey } from "@/lib/corporations/sectorLocation";
import { capacityRescaleRatio } from "@/lib/constants/capacityEconomy";
import {
  calculatePlantSectorSplit,
  didPlantSectorSplitSucceed,
  type PlantSectorSplitQuote,
} from "@/lib/corporations/plantSectorSplit";

export interface SplitResolution {
  quote: PlantSectorSplitQuote;
  succeeded: boolean;
  randomRoll: number;
  attackCostLocal: number;
  defenderCorporationName: string;
  sectorType: OperatingSectorType;
  plantsTransferred: number;
  capacityTransferred: number;
  bookValueTransferredAnchor: number;
}

export interface SplitRejection {
  status: number;
  error: string;
}

export type PlantSectorSplitAttemptResult =
  { ok: true; resolution: SplitResolution } | ({ ok: false } & SplitRejection);

class SplitConflictError extends Error {}

export async function attemptPlantSectorSplit(
  db: Db,
  args: {
    attacker: Pick<Corporation, "_id">;
    defender: Pick<Corporation, "_id">;
    targetSector: Pick<CorporateSector, "sectorType">;
    targetSectorId: ObjectId;
    stateId: string;
    countryId: CountryId;
    currentTurn: number;
    attackerFxRate: number;
    attackerCurrencyCode: CurrencyCode | undefined;
    /** Auditable roll in [0, 1). */
    randomRoll: number;
  }
): Promise<PlantSectorSplitAttemptResult> {
  const {
    attacker,
    defender,
    targetSector,
    targetSectorId,
    stateId,
    countryId,
    currentTurn,
    attackerFxRate,
    attackerCurrencyCode,
    randomRoll,
  } = args;
  let resolution: SplitResolution | null = null;
  let rejection: SplitRejection | null = null;
  // Production Mongo is standalone, so this body may run WITHOUT a transaction
  // (see `runTransactionWithSessionRetry`). The attacker is debited before the
  // plant writes, and on that path a later `SplitConflictError` will NOT roll
  // the debit back, so record what was taken and refund it by hand.
  let uncommittedDebit: { cashLocal: number; marketingStrength: number } | null = null;

  try {
    await runTransactionWithSessionRetry(getMongoClient, async (session) => {
      resolution = null;
      rejection = null;
      uncommittedDebit = null;

      // READ THESE IN SEQUENCE. A Mongo ClientSession cannot carry concurrent
      // operations. Issued through Promise.all, all four reads raced to be the
      // one that opens the transaction, each sending `startTransaction` at the
      // same txnNumber; the first won and every loser came back with
      // "Only servers in a sharded cluster can start a new transaction at the
      // active transaction number" (ticket #1239). Despite the wording that is
      // Mongo code 117 on an ordinary replica set, and because the race is in
      // OUR call pattern rather than in the session, retrying on a fresh
      // session cannot clear it: every attempt re-runs the same race.
      const freshAttacker = await db
        .collection<Corporation>("corporations")
        .findOne({ _id: attacker._id }, { session });
      const freshTarget = await db
        .collection<CorporateSector>("corporateSectors")
        .findOne({ _id: targetSectorId, stateId, corporationId: defender._id }, { session });
      const freshDefender = await db
        .collection<Corporation>("corporations")
        .findOne({ _id: defender._id }, { session });
      const existingOwnSector = await db.collection<CorporateSector>("corporateSectors").findOne(
        {
          stateId,
          sectorType: targetSector.sectorType,
          corporationId: attacker._id,
        },
        { session }
      );
      if (!freshAttacker || !freshTarget || !freshDefender) {
        rejection = {
          status: 409,
          error: "The target changed before the split began. Refresh and try again.",
        };
        return;
      }

      const defenderPlantCount = freshTarget.plantCount;
      const defenderBookValueAnchor = freshTarget.capacityBookAnchor;
      if (
        !Number.isInteger(defenderPlantCount) ||
        (defenderPlantCount ?? 0) < 2 ||
        typeof defenderBookValueAnchor !== "number" ||
        !Number.isFinite(defenderBookValueAnchor) ||
        defenderBookValueAnchor < 0
      ) {
        rejection = {
          status: 409,
          error: "The target's plant ledger changed. Refresh and try again.",
        };
        return;
      }
      if (
        existingOwnSector &&
        (!Number.isInteger(existingOwnSector.plantCount) ||
          typeof existingOwnSector.capacityBookAnchor !== "number" ||
          !Number.isFinite(existingOwnSector.capacityBookAnchor) ||
          existingOwnSector.capacityBookAnchor < 0)
      ) {
        rejection = {
          status: 503,
          error:
            "Your sector's whole-plant ledger is not ready yet. Try again after the next refresh.",
        };
        return;
      }

      const quote = calculatePlantSectorSplit({
        defenderPlantCount: defenderPlantCount as number,
        defenderBookValueAnchor,
        attackerMarketingStrength: freshAttacker.marketingStrength ?? 0,
        defenderMarketingStrength: freshDefender.marketingStrength ?? 0,
      });
      if (quote.plantsAtRisk <= 0) {
        rejection = { status: 400, error: "The defender must retain at least one plant." };
        return;
      }

      const capitalAnchor = corpLiquidCapitalToAnchor(
        freshAttacker.liquidCapital ?? 0,
        freshAttacker,
        attackerFxRate
      );
      if (capitalAnchor < quote.cashCostAnchor) {
        rejection = {
          status: 400,
          error: insufficientCapitalMessage(
            "Sector split",
            anchorToCorpLiquidCapital(quote.cashCostAnchor, freshAttacker, attackerFxRate),
            freshAttacker.liquidCapital,
            attackerCurrencyCode
          ),
        };
        return;
      }
      if ((freshAttacker.marketingStrength ?? 0) < quote.marketingStrengthCost) {
        rejection = {
          status: 400,
          error: `Insufficient marketing strength. This split costs ${quote.marketingStrengthCost} MS. You have ${roundMarketingStrength(freshAttacker.marketingStrength ?? 0)} MS.`,
        };
        return;
      }

      const attackCostLocal = anchorToCorpLiquidCapital(
        quote.cashCostAnchor,
        freshAttacker,
        attackerFxRate
      );
      const debit = await db.collection<Corporation>("corporations").updateOne(
        {
          _id: freshAttacker._id,
          liquidCapital: { $gte: attackCostLocal },
          marketingStrength: { $gte: quote.marketingStrengthCost },
        },
        {
          $inc: {
            liquidCapital: -attackCostLocal,
            marketingStrength: -quote.marketingStrengthCost,
          },
          $set: { updatedAt: new Date() },
        },
        { session }
      );
      if (debit.modifiedCount !== 1) {
        rejection = {
          status: 409,
          error: "Your corporation's resources changed. Refresh and try again.",
        };
        return;
      }
      // Only outside a transaction does this need undoing by hand; inside one
      // the abort reverses it for us.
      if (!session) {
        uncommittedDebit = {
          cashLocal: attackCostLocal,
          marketingStrength: quote.marketingStrengthCost,
        };
      }

      const succeeded = didPlantSectorSplitSucceed(quote.successProbability, randomRoll);
      let capacityTransferred = 0;
      let bookValueTransferredAnchor = 0;
      if (succeeded) {
        const openingCount = defenderPlantCount as number;
        const transferFraction = quote.plantsAtRisk / openingCount;
        const defenderCapacity =
          typeof freshTarget.capitalStock === "number" && Number.isFinite(freshTarget.capitalStock)
            ? Math.max(0, freshTarget.capitalStock)
            : 0;
        capacityTransferred = defenderCapacity * transferFraction;
        bookValueTransferredAnchor = defenderBookValueAnchor * transferFraction;
        const now = new Date();

        const targetWrite = await db.collection<CorporateSector>("corporateSectors").updateOne(
          {
            _id: freshTarget._id,
            plantCount: openingCount,
            capitalStock: freshTarget.capitalStock,
            capacityBookAnchor: defenderBookValueAnchor,
          },
          {
            $set: {
              plantCount: openingCount - quote.plantsAtRisk,
              capitalStock: defenderCapacity - capacityTransferred,
              capacityBookAnchor: defenderBookValueAnchor - bookValueTransferredAnchor,
              updatedAt: now,
            },
          },
          { session }
        );
        if (targetWrite.modifiedCount !== 1) {
          throw new SplitConflictError("The target changed during the split.");
        }

        const attackerCapacity =
          capacityTransferred *
          capacityRescaleRatio(
            freshTarget.sectorType as CorporationType,
            freshTarget.strategyId,
            existingOwnSector?.strategyId
          );

        if (existingOwnSector) {
          const attackerWrite = await db.collection<CorporateSector>("corporateSectors").updateOne(
            { _id: existingOwnSector._id },
            {
              $inc: {
                plantCount: quote.plantsAtRisk,
                capitalStock: attackerCapacity,
                capacityBookAnchor: bookValueTransferredAnchor,
              },
              $set: { updatedAt: now },
            },
            { session }
          );
          if (attackerWrite.modifiedCount !== 1) {
            throw new SplitConflictError("Your sector changed during the split.");
          }
        } else {
          const newSector: Omit<CorporateSector, "_id"> = {
            corporationId: freshAttacker._id,
            countryId,
            stateId,
            sectorType: freshTarget.sectorType as CorporationType,
            targetGrowthRate: 0,
            currentGrowthRate: 0,
            currentGrowthCost: 0,
            // PLANTS-GATED: this route requires plants mode; the turn derives
            // revenue from the transferred whole plants and their capacity.
            revenue: 0,
            capitalStock: attackerCapacity,
            capacityBookAnchor: bookValueTransferredAnchor,
            plantCount: quote.plantsAtRisk,
            plantUnitRemainder: 0,
            plantsStartTurn: currentTurn,
            // Built under plants by a player: earns the market from its first turn.
            ...(freshAttacker.ceoType === "character" ? { plantsGovernorExempt: true } : {}),
            profitMargin: DEFAULT_PROFIT_MARGIN,
            workers: DEFAULT_SECTOR_STARTING_WORKERS,
            createdAt: now,
            updatedAt: now,
          };
          try {
            await db
              .collection<CorporateSector>("corporateSectors")
              .insertOne(newSector as CorporateSector, { session });
          } catch (error) {
            if (isCorporateSectorDuplicateKey(error)) {
              throw new SplitConflictError("Your sector changed during the split.");
            }
            throw error;
          }
        }
      }

      resolution = {
        quote,
        succeeded,
        randomRoll,
        attackCostLocal,
        defenderCorporationName: freshDefender.name,
        sectorType: freshTarget.sectorType as CorporationType,
        plantsTransferred: succeeded ? quote.plantsAtRisk : 0,
        capacityTransferred,
        bookValueTransferredAnchor,
      };
      uncommittedDebit = null;
    });
  } catch (error) {
    // Non-atomic path only: the cash and MS were already taken and no plant
    // moved, so give them back before answering. Failing to refund would
    // charge the attacker for a split that never happened.
    const pendingRefund = uncommittedDebit as {
      cashLocal: number;
      marketingStrength: number;
    } | null;
    if (pendingRefund) {
      uncommittedDebit = null;
      await db
        .collection<Corporation>("corporations")
        .updateOne(
          { _id: attacker._id },
          {
            $inc: {
              liquidCapital: pendingRefund.cashLocal,
              marketingStrength: pendingRefund.marketingStrength,
            },
            $set: { updatedAt: new Date() },
          }
        )
        .catch(() => {});
    }
    if (error instanceof SplitConflictError) {
      return { ok: false, status: 409, error: error.message };
    }
    throw error;
  }

  const rejected = rejection as SplitRejection | null;
  if (rejected) return { ok: false, ...rejected };
  if (!resolution) return { ok: false, status: 409, error: "The split could not be resolved." };
  return { ok: true, resolution };
}
