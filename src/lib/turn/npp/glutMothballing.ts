/**
 * NPP corporations mothball plants during gluts or chronic losses and restart as prices recover.
 * buildNppGlutMothballUpdates emits at most one transition per eligible corporation and turn.
 */
import type { ObjectId } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import {
  GLUT_MOTHBALL_FILL_THRESHOLD,
  GLUT_MOTHBALL_PRICE_RATIO,
  GLUT_RESTART_PRICE_RATIO,
  COST_MOTHBALL_LOSS_TURNS,
  inManualRestartGrace,
} from "@/lib/turn/npp/nppCorporationTuning";
import { glutStaggerEligible } from "@/lib/turn/npp/cohort";
import {
  plantShortageScore,
  sectorShortageScore,
  type CommodityPriceRatioFn,
  type PlacementSignals,
} from "@/lib/turn/npp/marketSignals";
import { isMarketSaturated, isStuckAtThrottleFloor } from "@/lib/turn/npp/rules/marketSaturation";
import { nppDemandThrottle } from "@/lib/turn/npp/rules/fundedSellThrough";
import { chooseCostMothballSector } from "@/lib/turn/npp/costMothball";
import type { SectorProfitInfo } from "@/lib/turn/npp/sectorProfitability";
import type { NppCorpDecision } from "./corpDecisionTypes";

/** Resolve the gradual glut and chronic-loss mothball transitions for one corp. */
export function buildNppGlutMothballUpdates(args: {
  corporation: Corporation;
  turn: number;
  now: Date;
  plantsEnabled: boolean;
  sectorProfits: SectorProfitInfo[];
  divestedSectorIds: ObjectId[];
  priceRatioOf: CommodityPriceRatioFn;
  /** Physical cell saturation (PlacementSignals.marketSaturationOf). */
  marketSaturationOf?: PlacementSignals["marketSaturationOf"];
  /** Funded world epoch: the floor reading is sell-through (rules/fundedSellThrough). */
  fundedWorldEpoch?: string;
}): NppCorpDecision["sectorUpdates"] {
  const {
    corporation: corp,
    turn,
    now,
    plantsEnabled,
    sectorProfits,
    divestedSectorIds,
    priceRatioOf,
    marketSaturationOf,
    fundedWorldEpoch,
  } = args;
  const sectorUpdates: NppCorpDecision["sectorUpdates"] = [];

  // Sections 2a/2b only stop a glutted sector from growing; nothing takes
  // existing capacity off the market. Seeded NPP plants keep producing into
  // markets clearing at soldFraction 0.01-0.08, pinning finished-good prices to
  // the log-curve floor. Negative productionPolicy is the wrong lever (lean-ops
  // asymmetry cuts inputs harder than output); mothballing is right because a
  // cold plant frees both its supply and the extraction inputs it hoarded.
  //
  // Deliberately gradual: a corp is eligible only on its stagger slot, at most
  // one change per turn, and only while the sector's fill is below
  // GLUT_MOTHBALL_FILL_THRESHOLD, so a recovering market stops shedding. A
  // single-sector corp may go fully cold; the restart pass prices its market
  // without needing fill. Restarts use the price signal with wide hysteresis
  // and run before new mothballs. State-owned corps are exempt.
  if (plantsEnabled && !corp.countryOwnerId && glutStaggerEligible(corp._id.toString(), turn)) {
    let stateChangeBudget = 1;

    // Restart pass first: recovering markets reactivate before anything sheds.
    for (const sp of sectorProfits) {
      if (stateChangeBudget <= 0) break;
      if (sp.sector.mothballed !== true) continue;
      if (divestedSectorIds.includes(sp.sector._id)) continue;
      // A mine on a dead deposit (its state holds none of what it extracts)
      // was mothballed for that, not for a glut. Extraction prices are high
      // precisely because such mines produce nothing, so the price signal
      // would restart it straight back onto a zero-output deposit.
      if (sp.sector.sectorType === "extraction" && sp.sector.capacityUtilization === 0) continue;
      // A mothballed mine reopens on its own recipe's prices, not on a
      // shortage of a resource it does not extract.
      const ratio = plantShortageScore(
        sp.sector,
        sp.sector.countryId ?? corp.countryId,
        priceRatioOf
      );
      // A high price is no reason to reopen into a cell whose running plants
      // the throttle holds deep under capacity: that restart is the next
      // floor-stuck plant. Judged on the rivals, not on this plant's own
      // cold capacity.
      if (isMarketSaturated(marketSaturationOf?.(sp.sector, sp.sector))) continue;
      if (ratio >= GLUT_RESTART_PRICE_RATIO) {
        sectorUpdates.push({
          filter: { _id: sp.sector._id },
          // A revived plant re-earns chronic-cost status from zero instead
          // of mothballing again on its first losing turn (step 5).
          update: { $set: { mothballed: false, pnlLossTurns: 0, updatedAt: now } },
        });
        stateChangeBudget -= 1;
      }
    }

    if (stateChangeBudget > 0) {
      let worst: { sp: SectorProfitInfo; fill: number } | null = null;
      for (const sp of sectorProfits) {
        if (sp.sector.mothballed === true) continue;
        if (divestedSectorIds.includes(sp.sector._id)) continue;
        // The owner restarted this plant by hand: leave it running for the grace.
        if (inManualRestartGrace(sp.sector, turn)) continue;
        // Extraction is excluded: every extractable is shortage-side (its
        // fill is ~1 so the gate would never fire) and its output/rationing
        // legs live outside the clearing book this signal reads.
        if (sp.sector.sectorType === "extraction") continue;
        const fill = sp.sector.soldFraction;
        // soldFraction is only written under clearing mode; a sector that
        // has never cleared (mid-build, legacy) is not a candidate.
        if (fill == null || fill >= GLUT_MOTHBALL_FILL_THRESHOLD) continue;
        const ratio = sectorShortageScore(
          sp.sector.sectorType,
          sp.sector.countryId ?? corp.countryId,
          priceRatioOf
        );
        if (ratio > GLUT_MOTHBALL_PRICE_RATIO) continue;
        if (worst == null || fill < worst.fill) worst = { sp, fill };
      }
      // Floor-stuck plants (rules/marketSaturation): the throttle has held the
      // plant under a quarter of its capacity for a sustained stretch. Its fill
      // looks fine because the throttle already cut output to what sells, and
      // the price ratio reads shortage world-wide, so neither gate above sees
      // it. Fill-based sheds keep priority; this takes the deepest-throttled.
      if (worst == null) {
        let floorStuck: SectorProfitInfo | null = null;
        for (const sp of sectorProfits) {
          if (sp.sector.mothballed === true) continue;
          if (divestedSectorIds.includes(sp.sector._id)) continue;
          if (inManualRestartGrace(sp.sector, turn)) continue;
          if (sp.sector.sectorType === "extraction") continue;
          if (!isStuckAtThrottleFloor(sp.sector, fundedWorldEpoch)) continue;
          if (
            floorStuck == null ||
            (nppDemandThrottle(sp.sector, fundedWorldEpoch) ?? 1) <
              (nppDemandThrottle(floorStuck.sector, fundedWorldEpoch) ?? 1)
          ) {
            floorStuck = sp;
          }
        }
        if (floorStuck) worst = { sp: floorStuck, fill: floorStuck.sector.soldFraction ?? 0 };
      }
      if (worst) {
        sectorUpdates.push({
          filter: { _id: worst.sp.sector._id },
          update: { $set: { mothballed: true, updatedAt: now } },
        });
      } else {
        // Filled plants can still lose money. Mothball the longest-running loss;
        // this reversible action shares the budget and follows fill-based sheds.
        const coldest = chooseCostMothballSector(
          sectorProfits,
          divestedSectorIds,
          COST_MOTHBALL_LOSS_TURNS,
          turn
        );
        if (coldest) {
          sectorUpdates.push({
            filter: { _id: coldest.sector._id },
            update: { $set: { mothballed: true, updatedAt: now } },
          });
        }
      }
    }
  }

  return sectorUpdates;
}
