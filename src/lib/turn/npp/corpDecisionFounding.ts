/** Founding a new sector during an NPP corporation's turn decision. */
import type {
  NppPlantsContext,
  NppCorpDecisionContext,
  NppCorpDecision,
} from "@/lib/turn/npp/corpDecisionTypes";
import type { UnownedSector } from "@/lib/db/types/unownedSector";
import type { CorporationType, ManufacturingIndustryModel } from "@/lib/constants/corporations";
import type { PlacementSignals } from "@/lib/turn/npp/marketSignals";
import type { SectorBuildOrder } from "@/lib/db/types";
import { unownedHeadroomUnitsOf } from "@/lib/corporations/marketShare";
import { foundingStarterUnits, sectorEntryFeeAnchor } from "@/lib/corporations/foundingPlant";
import {
  computeBuildCost,
  MAX_BUILD_UNITS_PER_ORDER,
  CAPACITY_BUILD_TURNS,
  revenuePerCapacityUnit,
} from "@/lib/constants/capacityEconomy";
import { NEUTRAL_STAT } from "@/lib/stats/statsConstants";
import {
  NPP_FOUNDING_DEPLOY_FRACTION,
  NPP_EXTRACTION_FOUNDING_MAX_FACILITIES,
  NPP_FOUNDING_HEADROOM_SHARE,
  EXPANSION_COST,
} from "@/lib/turn/npp/nppCorporationTuning";
import { foundingUnmetSizing } from "@/lib/turn/npp/rules/marketSaturation";
import { floorUnitsToPlants } from "@/lib/corporations/wholePlants/rules";
import { noteFoundingCapacityOutcome } from "@/lib/turn/npp/capacityDecisionTelemetry";
import { isStateOwned } from "@/lib/nationalization/nationalCorporation";
import {
  setNppMarketEntryReason,
  resolveFoundingShortfallReason,
} from "@/lib/turn/npp/entryDiagnostics";

/** Prices and, when affordable, founds a new sector; returns the updated cash and entry state. */
export function decideNppFounding({
  foundingBlockEntered,
  plants,
  foundingTarget,
  nationalShare,
  liquidCapital,
  exceptionalShortageEntry,
  borrowAllowed,
  ctx,
  toCorpLocal,
  effectiveCashFloor,
  placementSignals,
  foundingStrategyId,
  entryDiagnostic,
  foundingOutcome,
  corp,
  cashToAnchor,
  newSectors,
  unownedDraws,
  cashLocal,
}: {
  foundingBlockEntered: boolean;
  plants: NppPlantsContext | undefined;
  foundingTarget: UnownedSector;
  nationalShare: (
    countryId: string,
    sectorType: CorporationType,
    industryModel?: string | null,
    mediaDiscriminator?: string | null
  ) => number;
  liquidCapital: number;
  exceptionalShortageEntry: boolean;
  borrowAllowed: boolean;
  ctx: NppCorpDecisionContext;
  toCorpLocal: (amountAnchor: number) => number;
  effectiveCashFloor: number;
  placementSignals: PlacementSignals | undefined;
  foundingStrategyId: string | undefined;
  entryDiagnostic: NppCorpDecision["entryDiagnostic"];
  foundingOutcome: FoundingCapacityOutcome;
  corp: Corporation;
  cashToAnchor: (amountLocal: number) => number;
  newSectors: {
    stateId: string;
    countryId: string;
    sectorType: CorporationType;
    industryModel?: ManufacturingIndustryModel | null;
    mediaDiscriminator?: MediaDiscriminator | null;
    revenue: number;
    profitMargin: number;
    strategyId?: string;
    starterOrder?: SectorBuildOrder;
  }[];
  unownedDraws: NonNullable<NppCorpDecision["unownedDraws"]>;
  cashLocal: number;
}) {
  let foundingCashLocal: number | undefined;
  let shortageCreditRequest: NppCorpDecision["shortageCreditRequest"];
  if (foundingBlockEntered) {
    if (plants?.enabled) {
      // NPPs and players found sectors on the same priced-capacity terms.
      const headroomUnits = unownedHeadroomUnitsOf(
        foundingTarget.sectorType as CorporationType,
        foundingTarget.headroomUnits,
        foundingTarget.revenue,
        plants.eraUnitScale,
        foundingTarget.industryModel,
        foundingTarget.mediaDiscriminator
      );
      const starterUnits = foundingStarterUnits(
        foundingTarget.sectorType as CorporationType,
        foundingTarget.industryModel as "vehicles" | null | undefined,
        foundingTarget.mediaDiscriminator
      );
      // Per-unit founding price. computeBuildCost is linear in units, so a
      // one-unit quote scales exactly while retaining its itemized breakdown.
      const foundingUnitQuote =
        starterUnits > 0
          ? computeBuildCost({
              sectorType: foundingTarget.sectorType as CorporationType,
              industryModel: foundingTarget.industryModel,
              mediaDiscriminator: foundingTarget.mediaDiscriminator,
              units: 1,
              // Greenfield entry uses the sector-type default strategy.
              strategyId: null,
              year: plants.year,
              preset: plants.preset,
              eraUnitScale: plants.eraUnitScale,
              marketSharePercent: 0,
              nationalMarketSharePercent: nationalShare(
                foundingTarget.countryId,
                foundingTarget.sectorType as CorporationType,
                foundingTarget.industryModel,
                foundingTarget.mediaDiscriminator
              ),
              primeRate: plants.primeRateOf(foundingTarget.countryId),
              // NPP CEOs have no Character Business Acumen; neutral is honest.
              acumen: NEUTRAL_STAT,
              hostCostOfLivingIndex: plants.costOfLivingOf(foundingTarget.stateId),
              founding: true,
            })
          : null;
      const perUnitFoundingAnchor = foundingUnitQuote?.totalAnchor ?? 0;
      // Charged in the corp's own currency: fee + build are ₳, liquidCapital is not.
      const entryFeeAnchor = sectorEntryFeeAnchor(plants.preset);
      const entryCapital =
        liquidCapital +
        (exceptionalShortageEntry && borrowAllowed ? (ctx.shortageEntryCreditLocal ?? 0) : 0);
      // Size the first build to available capital, not a token facility. Deploy
      // a bounded fraction of post-floor, post-fee surplus into capacity, capped
      // by the market's unowned headroom and by the per-order ceiling, and
      // floored at the one-facility quantum so a cash-poor entry still behaves
      // as before. See NPP_FOUNDING_DEPLOY_FRACTION.
      const perUnitFoundingLocal = toCorpLocal(perUnitFoundingAnchor);
      const entryFeeLocal = toCorpLocal(entryFeeAnchor);
      const deployBudgetLocal = Math.max(
        0,
        (entryCapital - effectiveCashFloor - entryFeeLocal) * NPP_FOUNDING_DEPLOY_FRACTION
      );
      const affordableUnits =
        perUnitFoundingLocal > 0 ? Math.floor(deployBudgetLocal / perUnitFoundingLocal) : 0;
      const isExtraction = foundingTarget.sectorType === "extraction";
      // Extraction founds against a DEPOSIT, not local demand: its output is a
      // traded commodity sold wherever the commodity is short, so it has no
      // demand-headroom cap (headroomUnits is 0 for every extraction bucket by
      // construction). Cash and a per-mine facility ceiling bound it instead;
      // the state deposit haircut caps real output and the reinvestment growth
      // leg deepens it over turns. Demand-side sectors keep the headroom cap.
      // Demand-side entrants are also capped by what the cell still wants, for
      // the mix they would run; the unowned pool's headroom overstates it. A
      // critical-shortage entry reads its deepest leg so a balanced co-product
      // cannot dilute the shortage (rules/marketSaturation).
      const unmetSizing = foundingUnmetSizing({
        unmetUnits: isExtraction
          ? null
          : (placementSignals?.unmetDemandUnitsOf?.(foundingTarget, {
              strategyId: foundingStrategyId,
              aggregate: exceptionalShortageEntry ? "max" : "mean",
            }) ?? null),
        starterUnits,
      });
      const sizeCap = isExtraction
        ? starterUnits * NPP_EXTRACTION_FOUNDING_MAX_FACILITIES
        : Math.min(headroomUnits * NPP_FOUNDING_HEADROOM_SHARE, unmetSizing.sizeCap);
      const unmetBlocksEntry = unmetSizing.blocksEntry;
      const sizedUnits =
        starterUnits > 0
          ? Math.max(
              starterUnits,
              Math.floor(Math.min(sizeCap, affordableUnits, MAX_BUILD_UNITS_PER_ORDER))
            )
          : 0;
      // Whole plants: the founding order is a whole number of starter plants.
      const buildUnits =
        plants?.wholePlants && starterUnits > 0
          ? Math.max(starterUnits, floorUnitsToPlants(sizedUnits, starterUnits))
          : sizedUnits;
      const buildAnchor = perUnitFoundingAnchor * buildUnits;
      const foundingCost = toCorpLocal(entryFeeAnchor + buildAnchor);
      entryDiagnostic = {
        ...entryDiagnostic,
        targetHeadroomUnits: headroomUnits,
        starterUnits: buildUnits,
        foundingCostLocal: foundingCost,
        entryCapitalLocal: entryCapital,
        cashFloorLocal: effectiveCashFloor,
      };

      // Affordability against the REAL cost. The generic surplus gate above is
      // a flat nominal band and cannot know what a build in this sector costs;
      // without this an NPP would commit to a plant it cannot pay for and drive
      // itself under the cash floor. Demand-side sectors also require the market
      // have room for the facility; extraction is deposit-gated (candidacy)
      // rather than headroom-gated, so it skips that check.
      // Named (not inlined) so the capacity observation below records the same
      // first-rejecting-gate outcome the branch takes.
      noteFoundingCapacityOutcome(foundingOutcome, {
        affordable:
          buildUnits > 0 &&
          !unmetBlocksEntry &&
          (isExtraction || headroomUnits >= buildUnits) &&
          entryCapital - foundingCost >= effectiveCashFloor,
        creditPath:
          exceptionalShortageEntry &&
          starterUnits > 0 &&
          headroomUnits >= starterUnits &&
          !unmetBlocksEntry &&
          !isStateOwned(corp) &&
          !corp.imfBailoutActive,
        sizeBlocked: starterUnits <= 0 || headroomUnits < starterUnits || unmetBlocksEntry,
        quote: {
          unitPriceAnchor: perUnitFoundingAnchor,
          dominanceMultiplier: foundingUnitQuote?.dominanceMultiplier ?? 1,
          requestedUnits: buildUnits,
          cashHeadroomAnchor: cashToAnchor(entryCapital - foundingCost),
        },
      });
      if (foundingOutcome.affordable) {
        const buildTurns = Math.max(
          1,
          CAPACITY_BUILD_TURNS(foundingTarget.sectorType as CorporationType, true)
        );
        // Legacy nameplate: demand-side sectors take the built share of the
        // pool; extraction has no pool, so it prices the nameplate off the units
        // built (unit x revenue-per-unit), as the player founding path does.
        const nameplateShare = headroomUnits > 0 ? Math.min(1, buildUnits / headroomUnits) : 0;
        const nameplateAnchor = isExtraction
          ? buildUnits *
            revenuePerCapacityUnit(
              foundingTarget.sectorType as CorporationType,
              plants.eraUnitScale,
              foundingTarget.industryModel,
              foundingTarget.mediaDiscriminator
            )
          : foundingTarget.revenue * nameplateShare;
        newSectors.push({
          stateId: foundingTarget.stateId,
          countryId: foundingTarget.countryId,
          sectorType: foundingTarget.sectorType,
          industryModel: (foundingTarget.industryModel ??
            null) as ManufacturingIndustryModel | null,
          mediaDiscriminator: foundingTarget.mediaDiscriminator,
          strategyId: foundingStrategyId,
          // Written in the corp's own currency, because that is what
          // `sectorTurn` reads it as (`readCorpEconomicAnchor` on the way in,
          // `writeCorpEconomicLocal` on the way out). The unowned pool is ₳,
          // so an unconverted copy made the sector's stored nameplate 1/fx of
          // the value the very next turn would restate it to — a one-turn ×fx
          // step change in every non-anchor currency.
          revenue: Math.round(toCorpLocal(nameplateAnchor)),
          profitMargin: 35,
          starterOrder: {
            unitsOrdered: buildUnits,
            // Greenfield: priced at the sector-type default, same as the quote.
            strategyId: null,
            costPaidAnchor: buildAnchor,
            startTurn: ctx.turn,
            onlineTurn: ctx.turn + buildTurns,
            smooth: true,
            ...(plants?.wholePlants ? { plantUnits: starterUnits } : {}),
          },
        });
        unownedDraws.push({
          stateId: foundingTarget.stateId,
          sectorType: foundingTarget.sectorType,
          industryModel: (foundingTarget.industryModel ??
            null) as ManufacturingIndustryModel | null,
          mediaDiscriminator: foundingTarget.mediaDiscriminator,
          units: buildUnits,
          countryId: foundingTarget.countryId,
        });
        cashLocal = entryCapital - foundingCost;
        foundingCashLocal = foundingCost;
        entryDiagnostic = setNppMarketEntryReason(entryDiagnostic, "entered");
      } else {
        if (foundingOutcome.creditPath && borrowAllowed) {
          shortageCreditRequest = {
            amountLocal: Math.max(0, foundingCost + effectiveCashFloor - entryCapital),
            sectorType: foundingTarget.sectorType as CorporationType,
          };
        }
        // Names the priced shortfall explicitly. Previously an
        // unaffordable candidate with no credit, size, or exceptional path
        // kept its pre-pricing reason (usually the cash floor), so the
        // funnel understated real founding-cost rejections.
        entryDiagnostic = setNppMarketEntryReason(
          entryDiagnostic,
          resolveFoundingShortfallReason({
            creditPath: foundingOutcome.creditPath,
            sizeBlocked: foundingOutcome.sizeBlocked,
            exceptionalShortageEntry,
          })
        );
      }
    } else {
      const foundingCost = toCorpLocal(EXPANSION_COST);
      const entryCapital =
        liquidCapital +
        (exceptionalShortageEntry && borrowAllowed ? (ctx.shortageEntryCreditLocal ?? 0) : 0);
      // Legacy (non-plants) founding has no per-unit quote; the observation
      // records the affordability facts with an explicit zero price.
      noteFoundingCapacityOutcome(foundingOutcome, {
        affordable: entryCapital - foundingCost >= effectiveCashFloor,
        creditPath: exceptionalShortageEntry && !isStateOwned(corp) && !corp.imfBailoutActive,
        sizeBlocked: false,
        quote: {
          unitPriceAnchor: 0,
          dominanceMultiplier: 1,
          requestedUnits: 0,
          cashHeadroomAnchor: cashToAnchor(entryCapital - foundingCost),
        },
      });
      if (foundingOutcome.affordable) {
        newSectors.push({
          stateId: foundingTarget.stateId,
          countryId: foundingTarget.countryId,
          sectorType: foundingTarget.sectorType,
          industryModel: (foundingTarget.industryModel ??
            null) as ManufacturingIndustryModel | null,
          mediaDiscriminator: foundingTarget.mediaDiscriminator,
          strategyId: foundingStrategyId,
          revenue: Math.round(foundingTarget.revenue * 0.25),
          profitMargin: 35,
        });
        cashLocal = entryCapital - foundingCost;
        foundingCashLocal = foundingCost;
        entryDiagnostic = setNppMarketEntryReason(entryDiagnostic, "entered");
      } else {
        if (foundingOutcome.creditPath && borrowAllowed) {
          shortageCreditRequest = {
            amountLocal: Math.max(0, foundingCost + effectiveCashFloor - entryCapital),
            sectorType: foundingTarget.sectorType as CorporationType,
          };
        }
        entryDiagnostic = setNppMarketEntryReason(
          entryDiagnostic,
          resolveFoundingShortfallReason({
            creditPath: foundingOutcome.creditPath,
            sizeBlocked: foundingOutcome.sizeBlocked,
            exceptionalShortageEntry,
          })
        );
      }
    }
  }
  return { entryDiagnostic, cashLocal, foundingCashLocal, shortageCreditRequest };
}
