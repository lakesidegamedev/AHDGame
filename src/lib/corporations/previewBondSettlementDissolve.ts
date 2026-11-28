import { assertDissolutionClaimsSettled } from "@/lib/corporations/assertDissolutionClaimsSettled";
/**
 * Quote for a voluntary dissolve while the company still owes bonds that have
 * not defaulted. The dissolve runs the bond settlement waterfall
 * (executeCorporationBondDefaultDissolution): cash, the sale of held bonds,
 * the buyback escrow and the plant salvage form one pool; bondholders are paid
 * pro-rata up to face value first, and shareholders share what is left.
 *
 * Reads the same inputs the executor reads, so the quote matches the payout.
 */
import type { Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import {
  corpLiquidCapitalToAnchor,
  fxRateForCorpFromMap,
  loadValuationFxRates,
} from "@/lib/currency/corporationCapital";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import {
  buildPrimeRateMap,
  computeSectorNpvSum,
  previewDissolveSettlement,
} from "@/lib/bonds/corporateBondDefault";
import { selfHeldBondUnits } from "@/lib/bonds/payInstitutionalBondHolders";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";
import { getGameState } from "@/lib/gameState";
import { sumSectorBookValueAnchor } from "@/lib/corporations/sectorProfitBasis";
import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";

export interface BondSettlementDissolvePreview {
  /** Outstanding bonds the company issued. */
  bondCount: number;
  /** True when any of them has defaulted: that case uses the bond default screen. */
  anyDefaulted: boolean;
  /** Face value owed to bondholders, anchor units. */
  totalBondClaimsAnchor: number;
  /** What bondholders receive, anchor units. */
  bondRecoveryPoolAnchor: number;
  /** What shareholders share after bondholders, anchor units. */
  shareholderPoolAnchor: number;
  /** Percent of face value bondholders recover. */
  bondRecoveryPct: number;
}

export async function previewBondSettlementDissolve(
  db: Db,
  corporation: Corporation,
  /** What selling the company's held bonds is quoted to raise, in its own currency. */
  heldBondProceedsCorp: number
): Promise<BondSettlementDissolvePreview | null> {
  corporation = await assertDissolutionClaimsSettled(db, corporation);
  const bonds = await bondsCollection(db)
    .find({ corporationId: corporation._id, matured: false })
    .toArray();
  if (bonds.length === 0) return null;

  const [sectors, centralBanks, fxByCurrency, marketMode] = await Promise.all([
    corporateSectorsCollection(db).find({ corporationId: corporation._id }).toArray(),
    centralBanksCollection(db).find({}).toArray(),
    loadValuationFxRates(db),
    getMarketSystemModeForDb(db),
  ]);
  const plantsEnabled = marketAtLeast(marketMode, "plants");
  const sectorNpv = computeSectorNpvSum(
    sectors,
    buildPrimeRateMap(centralBanks),
    corporation,
    fxByCurrency,
    { plantsEnabled }
  );
  const sectorBookAnchor = plantsEnabled
    ? sumSectorBookValueAnchor(
        sectors,
        (await getGameState(db))?.currentYear,
        await loadWorldEraUnitScale(db)
      )
    : 0;
  const corpFxRate = fxRateForCorpFromMap(corporation, fxByCurrency);
  const liquidCapitalAnchor = corpLiquidCapitalToAnchor(
    corporation.liquidCapital +
      Math.max(0, heldBondProceedsCorp) +
      (corporation.shareEscrowBalance ?? 0),
    corporation,
    corpFxRate
  );
  // A bond the company holds itself cancels against itself, as in the executor.
  const bondsNetOfSelfHeld = bonds.map((b) => {
    const selfUnits = selfHeldBondUnits(b);
    return selfUnits > 0
      ? { ...b, totalIssued: Math.max(0, b.totalIssued - selfUnits * BOND_UNIT_FACE_VALUE) }
      : b;
  });
  const settlement = previewDissolveSettlement(
    corporation,
    sectorNpv,
    bondsNetOfSelfHeld,
    liquidCapitalAnchor,
    fxByCurrency,
    { plantsEnabled, sectorBookAnchor }
  );
  return {
    bondCount: bonds.length,
    anyDefaulted: bonds.some((b) => b.defaulted),
    totalBondClaimsAnchor: settlement.totalBondClaims,
    bondRecoveryPoolAnchor: settlement.bondRecoveryPool,
    shareholderPoolAnchor: settlement.shareholderPool,
    bondRecoveryPct: settlement.bondRecoveryPct,
  };
}
