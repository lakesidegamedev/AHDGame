import type { Db, ObjectId } from "mongodb";
import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import type { CountryId } from "@/lib/constants/countries";
import {
  anchorToCorpLiquidCapital,
  corpLiquidCapitalToAnchor,
  getCorpFxRate,
} from "@/lib/currency/corporationCapital";
import { loadTreasuryCashContext } from "./treasuryLedger";
import { creditTreasuryProceedsFromAnchor } from "./treasury";

export interface CompensationClawbackResult {
  /** ₳ recovered from the corporation's cash and credited to the treasury. */
  recoveredAnchor: number;
  /** ₳ the corporation could not pay, recorded as federal tax arrears owed to the country. */
  owedAnchor: number;
}

export interface CompensationRecoveryInput {
  countryId: string;
  corporationId: ObjectId;
  sectorId: ObjectId;
  takenAtTurn: number;
  compensationAnchor: number;
  /** Written against the state corporation before a spin-out creates the real owner. */
  spinOut?: boolean;
}

const NOTHING: CompensationClawbackResult = { recoveredAnchor: 0, owedAnchor: 0 };

export function compensationRecoveryKey(sectorId: ObjectId, takenAtTurn: number): string {
  return `${sectorId.toHexString()}_${takenAtTurn}`;
}

const markerPath = (key: string) => `pendingCompensationRecoveries.${key}`;

/**
 * Record that a corporation owes back the compensation for a taking a court has
 * reversed. The marker is durable: it is written before any cash moves and is
 * only removed by the write that finishes the recovery, so a crash leaves it for
 * {@link completeCompensationRecovery} to resume.
 */
export async function recordCompensationRecovery(
  db: Db,
  input: CompensationRecoveryInput
): Promise<string | null> {
  if (!(input.compensationAnchor > 0)) return null;
  const key = compensationRecoveryKey(input.sectorId, input.takenAtTurn);
  const corps = await getCorporationsCollection(db);
  await corps.updateOne(
    { _id: input.corporationId, [markerPath(key)]: { $exists: false } },
    {
      $set: {
        [markerPath(key)]: {
          sectorId: input.sectorId,
          takenAtTurn: input.takenAtTurn,
          countryId: input.countryId,
          anchor: input.compensationAnchor,
          stage: "pending",
          ...(input.spinOut ? { spinOut: true } : {}),
        },
      },
    }
  );
  return key;
}

/**
 * Hand a spin-out marker to the corporation that now owns the asset. The new
 * marker is written before the old one is removed, so a crash leaves at least
 * one of them.
 */
export async function rehomeSpinOutRecovery(
  db: Db,
  fromCorporationId: ObjectId,
  key: string,
  toCorporationId: ObjectId
): Promise<void> {
  const corps = await getCorporationsCollection(db);
  const from = await corps.findOne({ _id: fromCorporationId });
  const marker = from?.pendingCompensationRecoveries?.[key];
  if (!marker?.spinOut) return;
  await recordCompensationRecovery(db, {
    countryId: marker.countryId,
    corporationId: toCorporationId,
    sectorId: marker.sectorId,
    takenAtTurn: marker.takenAtTurn,
    compensationAnchor: marker.anchor,
  });
  await corps.updateOne(
    { _id: fromCorporationId, [`${markerPath(key)}.spinOut`]: true },
    { $unset: { [markerPath(key)]: "" } }
  );
}

/** Drop a marker whose reversal did not go ahead; nothing has moved at the `pending` stage. */
export async function discardCompensationRecovery(
  db: Db,
  corporationId: ObjectId,
  key: string
): Promise<void> {
  const corps = await getCorporationsCollection(db);
  await corps.updateOne(
    { _id: corporationId, [`${markerPath(key)}.stage`]: "pending" },
    { $unset: { [markerPath(key)]: "" } }
  );
}

/**
 * Finish a recorded recovery. The corporation pays what its cash covers, claimed
 * with a guard on its balance in the same write that advances the marker to
 * `debited`; the treasury is credited from that recorded amount; the final write
 * books the unpaid rest as `federalTaxArrearsAnchorByCountry` (repaid from later
 * realized cash by the normal arrears settlement) and removes the marker. Safe to
 * call again after a crash. Under the funded Treasury ledger no cash is moved
 * here and the whole amount becomes arrears.
 */
export async function completeCompensationRecovery(
  db: Db,
  corporationId: ObjectId,
  key: string,
  now: Date
): Promise<CompensationClawbackResult> {
  const corps = await getCorporationsCollection(db);
  const corp = await corps.findOne({ _id: corporationId });
  const marker = corp?.pendingCompensationRecoveries?.[key];
  if (!corp || !marker) return NOTHING;
  const { anchor, countryId } = marker;

  let paidAnchor = marker.stage === "debited" ? (marker.paidAnchor ?? 0) : 0;
  if (marker.stage === "pending") {
    const funded = (await loadTreasuryCashContext(db))?.treasuryCashLedgerEnabled === true;
    const fxRate = await getCorpFxRate(db, corp);
    const cashAnchor = funded
      ? 0
      : Math.max(0, corpLiquidCapitalToAnchor(corp.liquidCapital ?? 0, corp, fxRate));
    const payAnchor = Math.min(anchor, cashAnchor);
    if (payAnchor > 0) {
      const payLocal = Math.min(
        corp.liquidCapital ?? 0,
        anchorToCorpLiquidCapital(payAnchor, corp, fxRate)
      );
      const debit = await corps.updateOne(
        {
          _id: corporationId,
          liquidCapital: { $gte: payLocal },
          [`${markerPath(key)}.stage`]: "pending",
        },
        {
          $inc: { liquidCapital: -payLocal },
          $set: {
            [`${markerPath(key)}.stage`]: "debited",
            [`${markerPath(key)}.paidAnchor`]: payAnchor,
            updatedAt: now,
          },
        }
      );
      if (debit.modifiedCount === 1) paidAnchor = payAnchor;
    }
  }

  if (paidAnchor > 0) {
    await creditTreasuryProceedsFromAnchor(db, countryId as CountryId, paidAnchor, now, {
      flow: "nationalization_compensation",
      ledger: { context: await loadTreasuryCashContext(db) },
      site: "clawbackCompensation",
      onceKey: key,
    });
  }

  const owedAnchor = Math.max(0, anchor - paidAnchor);
  const settle = await corps.updateOne(
    { _id: corporationId, [markerPath(key)]: { $exists: true } },
    {
      ...(owedAnchor > 0
        ? { $inc: { [`federalTaxArrearsAnchorByCountry.${countryId}`]: owedAnchor } }
        : {}),
      $unset: { [markerPath(key)]: "" },
      $set: { updatedAt: now },
    }
  );
  if (settle.modifiedCount !== 1) return { recoveredAnchor: paidAnchor, owedAnchor: 0 };
  return { recoveredAnchor: paidAnchor, owedAnchor };
}
