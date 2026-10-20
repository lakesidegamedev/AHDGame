import type { Db } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { sectorEconomicScale } from "@/lib/corporations/sectorProfitBasis";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";
import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";
import {
  techNodeCashFloorAnchor,
  type TechPlantBasis,
  type TechPlantBasisSlice,
} from "@/lib/constants/techTree/costs";
import { isPrimaryTechSector } from "@/lib/constants/techTree/selectors";
import { TURNS_PER_DAY } from "@/lib/constants/corporations";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import {
  anchorToCorpLiquidCapital,
  corpCapitalToAnchor,
  fxRateForCorpFromMap,
  fxRateForSectorHostFromMap,
  loadFxRatesByCurrency,
  resolveSectorHostCurrencyCode,
} from "@/lib/currency/corporationCapital";

/**
 * A corporation's daily gross revenue, expressed in the corp's OWN currency.
 *
 * Ticket #1118. This used to be a bare sum of every sector's `revenue`, which
 * silently added currencies together. Sector revenue is stored in the sector's
 * host currency, so a corp with one Japanese sector was summing hundreds of
 * millions of yen straight into a dollar total. The reporter had a Kansai
 * retail sector booking 268,000,000 JPY, worth well under a million dollars at
 * 1953 rates, next to fifteen million dollars of US sectors. The sum came out
 * around 283,000,000, roughly eighteen times the real figure, and every cost
 * priced off it inherited the error.
 *
 * Each sector is therefore converted to the anchor at its own host rate before
 * being added, and only the total is converted into the corp's currency.
 *
 * The `sectorEconomicScale` basis is preserved exactly: under plants that is
 * `max(revenue, capacity value)` rather than raw revenue, and callers depended
 * on that. The only thing that changes is that the amounts being added are
 * finally in the same unit.
 */
export interface CorpDailyGrossRevenuePricing {
  dailyGrossRevenueLocal: number;
  capacityFloorApplied: boolean;
  /** Era-scaled minimum tech node cash price in the corp's currency (#1506). */
  techCashFloorLocal: number;
  /** Per-turn plant P&L tech nodes are valued against, in the corp's currency. */
  techPlantBasis: TechPlantBasis;
}

type TechBasisCorp = Pick<
  Corporation,
  "countryId" | "liquidCurrencyCode" | "type" | "industryModel" | "mediaDiscriminator"
>;

/**
 * Per-turn plant revenue, input bill and labour bill from each sector's stored
 * `plantsPnl` (daily, host currency), converted into the corp's currency and
 * split into the corp's primary sector type and all sectors. Sectors without a
 * stored P&L contribute nothing, so a corp outside plants prices every node
 * off its revenue fraction.
 */
export function corpTechPlantBasisFromSectors(
  sectors: readonly CorporateSector[],
  corp: TechBasisCorp,
  options: { fxByCurrency: ReadonlyMap<CurrencyCode, number> }
): TechPlantBasis {
  const zero = (): TechPlantBasisSlice => ({ revenue: 0, inputs: 0, labour: 0 });
  const primary = zero();
  const all = zero();
  const corpRate = fxRateForCorpFromMap(corp, options.fxByCurrency);
  for (const sector of sectors) {
    const pnl = sector.plantsPnl;
    if (!pnl) continue;
    const toCorpPerTurn = (daily: number | undefined) =>
      Number.isFinite(daily)
        ? anchorToCorpLiquidCapital(
            corpCapitalToAnchor(
              (daily as number) / TURNS_PER_DAY,
              resolveSectorHostCurrencyCode(sector, corp),
              fxRateForSectorHostFromMap(sector, corp, options.fxByCurrency)
            ),
            corp,
            corpRate
          )
        : 0;
    const line = {
      revenue: toCorpPerTurn(pnl.revenue),
      inputs: toCorpPerTurn(pnl.inputs),
      labour: toCorpPerTurn(pnl.labour),
    };
    const slices = isPrimaryTechSector(
      corp,
      sector.sectorType as OperatingSectorType,
      sector.industryModel,
      sector.mediaDiscriminator
    )
      ? [primary, all]
      : [all];
    for (const slice of slices) {
      slice.revenue += line.revenue;
      slice.inputs += line.inputs;
      slice.labour += line.labour;
    }
  }
  return { primary, all };
}

/**
 * The era-scaled minimum tech node cash price, converted into the corp's own
 * currency. Pure, so turn paths holding the era and FX snapshots can share it.
 */
export function corpTechCashFloorLocal(
  corp: Pick<Corporation, "countryId" | "liquidCurrencyCode">,
  options: { eraUnitScale: number; fxByCurrency: ReadonlyMap<CurrencyCode, number> }
): number {
  return anchorToCorpLiquidCapital(
    techNodeCashFloorAnchor(options.eraUnitScale),
    corp,
    fxRateForCorpFromMap(corp, options.fxByCurrency)
  );
}

/**
 * Pure counterpart to {@link corpDailyGrossRevenuePricingLocal} for turn paths
 * that already hold the sector, feature, era, and FX snapshots. Keeping this
 * arithmetic shared prevents autonomous NPP unlocks from pricing raw host
 * currencies together or treating the already-daily sector revenue as hourly.
 */
export function corpDailyGrossRevenueLocalFromSectors(
  sectors: readonly CorporateSector[],
  corp: Pick<Corporation, "countryId" | "liquidCurrencyCode">,
  options: {
    plantsEnabled: boolean;
    eraUnitScale: number;
    fxByCurrency: ReadonlyMap<CurrencyCode, number>;
  }
): number {
  let totalAnchor = 0;
  for (const sector of sectors) {
    const local = sectorEconomicScale(sector, options.plantsEnabled, options.eraUnitScale);
    if (!local) continue;
    totalAnchor += corpCapitalToAnchor(
      local,
      resolveSectorHostCurrencyCode(sector, corp),
      fxRateForSectorHostFromMap(sector, corp, options.fxByCurrency)
    );
  }

  return anchorToCorpLiquidCapital(
    totalAnchor,
    corp,
    fxRateForCorpFromMap(corp, options.fxByCurrency)
  );
}

/** The pricing basis plus whether owned plant capacity supplied its floor. */
export async function corpDailyGrossRevenuePricingLocal(
  db: Db,
  corp: Pick<Corporation, "_id"> & TechBasisCorp
): Promise<CorpDailyGrossRevenuePricing> {
  const [sectors, plantsEnabled, eraUnitScale, fxByCurrency] = await Promise.all([
    db
      .collection<CorporateSector>("corporateSectors")
      .find(
        { corporationId: corp._id },
        {
          projection: {
            revenue: 1,
            capitalStock: 1,
            strategyId: 1,
            sectorType: 1,
            countryId: 1,
            industryModel: 1,
            mediaDiscriminator: 1,
            plantsPnl: 1,
          },
        }
      )
      .toArray(),
    getMarketSystemModeForDb(db).then((m) => marketAtLeast(m, "plants")),
    loadWorldEraUnitScale(db),
    loadFxRatesByCurrency(db),
  ]);

  return {
    dailyGrossRevenueLocal: corpDailyGrossRevenueLocalFromSectors(sectors, corp, {
      plantsEnabled,
      eraUnitScale,
      fxByCurrency,
    }),
    capacityFloorApplied: plantsEnabled,
    techCashFloorLocal: corpTechCashFloorLocal(corp, { eraUnitScale, fxByCurrency }),
    techPlantBasis: corpTechPlantBasisFromSectors(sectors, corp, { fxByCurrency }),
  };
}

export async function corpDailyGrossRevenueLocal(
  db: Db,
  corp: Pick<Corporation, "_id"> & TechBasisCorp
): Promise<number> {
  return (await corpDailyGrossRevenuePricingLocal(db, corp)).dailyGrossRevenueLocal;
}
