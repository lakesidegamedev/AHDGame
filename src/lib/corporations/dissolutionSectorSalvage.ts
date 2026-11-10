import type { Db } from "mongodb";
import type { CorporateSector, Corporation } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { sumCorporateSectorNpv } from "@/lib/bonds/corporateCredit";
import { buildPrimeRateByCountry } from "@/lib/centralBank/helpers";
import { DISSOLUTION_SECTOR_SALVAGE_FRACTION } from "@/lib/constants/corporations";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";
import { getGameState } from "@/lib/gameState";
import { sumSectorBookValueAnchor } from "@/lib/corporations/sectorProfitBasis";
import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";

/**
 * Salvage value (in ₳) a dissolving corp recovers from its operating sectors.
 *
 * Sectors pass to NPP successors with no going-concern sale, so only
 * {@link DISSOLUTION_SECTOR_SALVAGE_FRACTION} is realized for the payout
 * pool; paying full value would mint the enterprise value.
 *
 * Valued as going-concern NPV below the "plants" market tier, and as
 * replacement-cost book of built capacity plus in-progress construction at or
 * above it, so build-then-dissolve is a loss rather than a mint.
 *
 * Shared with the bond-default settlement ({@link previewDissolveSettlement})
 * so quoted and executed payouts match. Returns 0 for a corp with no
 * positive-NPV or no built sectors.
 */
export async function computeDissolutionSectorSalvageAnchor(
  db: Db,
  corporation: Corporation,
  fxByCurrency: ReadonlyMap<CurrencyCode, number>
): Promise<number> {
  const [sectors, centralBanks, marketMode] = await Promise.all([
    db
      .collection<CorporateSector>("corporateSectors")
      .find({ corporationId: corporation._id })
      .toArray(),
    centralBanksCollection(db).find({}).toArray(),
    getMarketSystemModeForDb(db),
  ]);
  const plantsEnabled = marketAtLeast(marketMode, "plants");

  if (plantsEnabled) {
    // Year read only on the book path — the legacy NPV path keeps its old query set.
    const gameState = await getGameState(db);
    const bookAnchor = sumSectorBookValueAnchor(
      sectors,
      gameState?.currentYear,
      await loadWorldEraUnitScale(db)
    );
    return DISSOLUTION_SECTOR_SALVAGE_FRACTION * Math.max(0, bookAnchor);
  }

  // Member-aware: shared-bank members (IE → ECB) must resolve the shared doc.
  const primeRateByCountry = buildPrimeRateByCountry(centralBanks);
  const sectorNpvAnchor = sumCorporateSectorNpv(
    sectors,
    corporation._id,
    primeRateByCountry,
    corporation,
    fxByCurrency
  );
  return DISSOLUTION_SECTOR_SALVAGE_FRACTION * Math.max(0, sectorNpvAnchor);
}
