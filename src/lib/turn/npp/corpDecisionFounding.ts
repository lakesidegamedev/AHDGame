/** Founding a new sector during an NPP corporation's turn decision. */
import type {
  NppPlantsContext,
  NppCorpDecisionContext,
  NppCorpDecision,
} from "@/lib/turn/npp/corpDecisionTypes";
import type { MarketCandidate } from "@/lib/turn/npp/marketCandidates";
import type { CorporationType } from "@/lib/constants/corporations";
import { marketRoomUnits, type PlacementSignals } from "@/lib/turn/npp/marketSignals";
import type { SectorBuildOrder } from "@/lib/db/types";
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
import type { FoundingCapacityOutcome } from "@/lib/turn/npp/capacityDecisionTelemetry";
import type { Corporation } from "@/lib/db/types";

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
  entryDiagnostic: initialEntryDiagnostic,
  foundingOutcome,
  corp,
  cashToAnchor,
  newSectors,
  demandClaims,
  cashLocal,
}: {
  foundingBlockEntered: boolean;
  plants: NppPlantsContext | undefined;
  foundingTarget: MarketCandidate | null;
  nationalShare: (countryId: string, sectorType: CorporationType) => number;
  liquidCapital: number;
  exceptionalShortageEntry: boolean;
  borrowAllowed: boolean;
  ctx: NppCorpDecisionContext;
  toCorpLocal: (amountAnchor: number) => number;
  effectiveCashFloor: number;
  placementSignals: PlacementSignals | undefined;
  foundingStrategyId: string | undefined;
  entryDiagnostic: NonNullable<NppCorpDecision["entryDiagnostic"]>;
  foundingOutcome: FoundingCapacityOutcome;
  corp: Corporation;
  cashToAnchor: (amountLocal: number) => number;
  newSectors: {
    stateId: string;
    countryId: string;
    sectorType: CorporationType;
    revenue: number;
    profitMargin: number;
    strategyId?: string;
    starterOrder?: SectorBuildOrder;
  }[];
  demandClaims: NonNullable<NppCorpDecision["demandClaims"]>;
  cashLocal: number;
}) {
  let entryDiagnostic: NppCorpDecision["entryDiagnostic"] = initialEntryDiagnostic;
  let foundingCashLocal: number | undefined;
  let foundingCreditLocal: number | undefined;
  let shortageCreditRequest: NppCorpDecision["shortageCreditRequest"];
  // foundingBlockEntered already requires a target; the check narrows the type.
  if (foundingBlockEntered && foundingTarget !== null) {
    if (plants?.enabled) {
      // NPPs and players found sectors on the same priced-capacity terms.
      const starterUnits = foundingStarterUnits(foundingTarget.sectorType as CorporationType);
      // Per-unit founding price. computeBuildCost is linear in units, so a
      // one-unit quote scales exactly while retaining its itemized breakdown.
      const foundingUnitQuote =
        starterUnits > 0
          ? computeBuildCost({
              sectorType: foundingTarget.sectorType as CorporationType,
              units: 1,
              // Greenfield entry uses the sector-type default strategy.
              strategyId: null,
              year: plants.year,
              preset: plants.preset,
              eraUnitScale: plants.eraUnitScale,
              marketSharePercent: 0,
              nationalMarketSharePercent: nationalShare(
                foundingTarget.countryId,
                foundingTarget.sectorType as CorporationType
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
      // by the market's unmet demand and by the per-order ceiling, and
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
      // Every entrant, mines included, is capped by what the bucket still wants,
      // net of capacity already ordered or founded this pass, for the mix it
      // would run. A critical-shortage entry reads its deepest leg so a
      // balanced co-product cannot dilute the shortage (rules/marketSaturation).
      // A mine's deposit and a per-mine facility ceiling only bound that size
      // further; they are never the reason to found.
      const unmetUnits = !placementSignals?.unmetDemandUnitsOf
        ? null
        : marketRoomUnits(placementSignals, foundingTarget, {
            strategyId: foundingStrategyId,
            aggregate: exceptionalShortageEntry ? "max" : "mean",
          });
      const unmetSizing = foundingUnmetSizing({ unmetUnits, starterUnits });
      // NPP entrants share a per-turn budget of new capacity in the cell and
      // need a price signal that has held; player autopilot is not paced.
      const paced = corp.ceoType === "npp";
      const paceRoom =
        paced && placementSignals?.paceRoomUnitsOf
          ? placementSignals.paceRoomUnitsOf(foundingTarget, demandClaims, {
              strategyId: foundingStrategyId,
              aggregate: exceptionalShortageEntry ? "max" : "mean",
            })
          : Number.POSITIVE_INFINITY;
      const signalHeld =
        !paced ||
        !placementSignals?.priceSignalPersistedOf ||
        placementSignals.priceSignalPersistedOf(foundingTarget, {
          strategyId: foundingStrategyId,
        });
      const sizeCap = Math.min(
        isExtraction
          ? Math.min(unmetSizing.sizeCap, starterUnits * NPP_EXTRACTION_FOUNDING_MAX_FACILITIES)
          : unmetSizing.sizeCap,
        paceRoom
      );
      const unmetBlocksEntry = unmetSizing.blocksEntry || starterUnits > paceRoom || !signalHeld;
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
        targetUnmetDemandUnits: unmetUnits ?? undefined,
        starterUnits: buildUnits,
        foundingCostLocal: foundingCost,
        entryCapitalLocal: entryCapital,
        cashFloorLocal: effectiveCashFloor,
      };

      // Affordability against the REAL cost. The generic surplus gate above is
      // a flat nominal band and cannot know what a build in this sector costs;
      // without this an NPP would commit to a plant it cannot pay for and drive
      // itself under the cash floor. Demand-side sectors also require the market
      // have room for the facility.
      // Named (not inlined) so the capacity observation below records the same
      // first-rejecting-gate outcome the branch takes.
      noteFoundingCapacityOutcome(foundingOutcome, {
        affordable:
          buildUnits > 0 && !unmetBlocksEntry && entryCapital - foundingCost >= effectiveCashFloor,
        creditPath:
          exceptionalShortageEntry &&
          starterUnits > 0 &&
          !unmetBlocksEntry &&
          !isStateOwned(corp) &&
          !corp.imfBailoutActive,
        sizeBlocked: starterUnits <= 0 || unmetBlocksEntry,
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
        // Nameplate priced off the units built, as the player founding path does.
        const nameplateAnchor =
          buildUnits *
          revenuePerCapacityUnit(foundingTarget.sectorType as CorporationType, plants.eraUnitScale);
        newSectors.push({
          stateId: foundingTarget.stateId,
          countryId: foundingTarget.countryId,
          sectorType: foundingTarget.sectorType,
          strategyId: foundingStrategyId,
          // Written in the corp's own currency, because that is what
          // `sectorTurn` reads it as (`readCorpEconomicAnchor` on the way in,
          // `writeCorpEconomicLocal` on the way out). The nameplate is ₳,
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
            deliveryBaseFraction: 0,
            ...(plants?.wholePlants ? { plantUnits: starterUnits } : {}),
          },
        });
        demandClaims.push({
          stateId: foundingTarget.stateId,
          sectorType: foundingTarget.sectorType as CorporationType,
          units: buildUnits,
          countryId: foundingTarget.countryId,
          ...(foundingTarget.sectorType === "extraction"
            ? { strategyId: foundingStrategyId ?? null }
            : {}),
        });
        cashLocal = entryCapital - foundingCost;
        foundingCashLocal = foundingCost;
        if (entryCapital > liquidCapital) foundingCreditLocal = entryCapital - liquidCapital;
        entryDiagnostic = setNppMarketEntryReason(entryDiagnostic, "entered");
      } else {
        if (foundingOutcome.creditPath && borrowAllowed) {
          shortageCreditRequest = {
            amountLocal: Math.max(0, foundingCost + effectiveCashFloor - entryCapital),
            sectorType: foundingTarget.sectorType as CorporationType,
          };
        }
        // Names the priced shortfall explicitly, so an unaffordable candidate
        // with no credit, size, or exceptional path is not reported under its
        // pre-pricing reason (usually the cash floor) in the funnel.
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
          strategyId: foundingStrategyId,
          revenue: Math.round(
            foundingStarterUnits(foundingTarget.sectorType as CorporationType) *
              revenuePerCapacityUnit(foundingTarget.sectorType as CorporationType, 1)
          ),
          profitMargin: 35,
        });
        cashLocal = entryCapital - foundingCost;
        foundingCashLocal = foundingCost;
        if (entryCapital > liquidCapital) foundingCreditLocal = entryCapital - liquidCapital;
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
  return {
    entryDiagnostic,
    cashLocal,
    foundingCashLocal,
    foundingCreditLocal,
    shortageCreditRequest,
  };
}
