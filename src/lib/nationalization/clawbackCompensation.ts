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

/**
 * Recover the compensation a government paid for a taking that a court has
 * reversed. The corporation pays what its cash covers (claimed with a guard on
 * its balance before any treasury credit); the rest becomes a debt to that
 * country in `federalTaxArrearsAnchorByCountry`, which the normal arrears
 * settlement repays from later realized cash.
 */
export async function clawBackNationalizationCompensation(
  db: Db,
  args: { countryId: string; corporationId: ObjectId; compensationAnchor: number; now: Date }
): Promise<CompensationClawbackResult> {
  const { countryId, corporationId, compensationAnchor, now } = args;
  if (!(compensationAnchor > 0)) return { recoveredAnchor: 0, owedAnchor: 0 };
  const corps = await getCorporationsCollection(db);
  const corp = await corps.findOne({ _id: corporationId });
  if (!corp) return { recoveredAnchor: 0, owedAnchor: 0 };

  const fxRate = await getCorpFxRate(db, corp);
  const cashAnchor = Math.max(0, corpLiquidCapitalToAnchor(corp.liquidCapital ?? 0, corp, fxRate));
  const payAnchor = Math.min(compensationAnchor, cashAnchor);
  let recoveredAnchor = 0;
  if (payAnchor > 0) {
    const payLocal = Math.min(
      corp.liquidCapital ?? 0,
      anchorToCorpLiquidCapital(payAnchor, corp, fxRate)
    );
    const claim = await corps.updateOne(
      { _id: corporationId, liquidCapital: { $gte: payLocal } },
      { $inc: { liquidCapital: -payLocal }, $set: { updatedAt: now } }
    );
    if (claim.modifiedCount === 1) {
      recoveredAnchor = payAnchor;
      await creditTreasuryProceedsFromAnchor(db, countryId as CountryId, payAnchor, now, {
        flow: "nationalization_compensation",
        ledger: { context: await loadTreasuryCashContext(db) },
        site: "clawbackCompensation",
      });
    }
  }
  const owedAnchor = Math.max(0, compensationAnchor - recoveredAnchor);
  if (owedAnchor > 0) {
    await corps.updateOne(
      { _id: corporationId },
      {
        $inc: { [`federalTaxArrearsAnchorByCountry.${countryId}`]: owedAnchor },
        $set: { updatedAt: now },
      }
    );
  }
  return { recoveredAnchor, owedAnchor };
}
