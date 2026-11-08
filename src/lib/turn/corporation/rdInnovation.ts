import { extractionRdTargetIndex } from "./rules/rdTarget";
import { rdDepositGrowth } from "./rules/rdDepositGrowth";
import { getStateDisplayName } from "@/lib/commodity-map/commodityRegionMappings";
import type { UpdateOneModel } from "mongodb";
import type { CorporationLookups } from "./types";
import type { CorporateSector } from "@/lib/db/types/corporation";
import type { ExtractableResource } from "@/lib/constants/commodities";
import { EXTRACTABLE_RESOURCES } from "@/lib/constants/commodities";
import {
  RD_INNOVATION_INTERVAL,
  RD_INNOVATION_SCORE_THRESHOLD,
  RD_EXTRACTION_BOOST_MIN,
  RD_EXTRACTION_BOOST_MAX,
  RD_REGULAR_BOOST_MIN,
  RD_REGULAR_BOOST_MAX,
  RD_CAPACITY_BOOST_MIN_PCT,
  RD_CAPACITY_BOOST_MAX_PCT,
} from "@/lib/constants/corporations";
import { SECTOR_STRATEGIES } from "@/lib/constants/sectorStrategies";
import { createNotifications } from "@/lib/notifications";
import { plantChangePipeline } from "@/lib/corporations/plantLedger";
import {
  getStateResourceCapacity,
  lookupStateResourceCapacity,
} from "@/lib/seeds/reference/stateResourceCapacity";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";

/** A state's seeded deposits (headroom included), or undefined when it was seeded with none. */
export type SeedDepositLookup = (
  countryId: string,
  stateId: string
) => Partial<Record<ExtractableResource, number>> | undefined;

/** Seeded deposits for the world's reset preset, the reference the research ceiling scales. */
export function seedDepositLookup(preset: string | undefined): SeedDepositLookup {
  const capacityMap = getStateResourceCapacity(preset ?? DEFAULT_SEED_PRESET);
  return (countryId, stateId) =>
    lookupStateResourceCapacity(capacityMap, countryId, stateId)?.resources;
}

// PLANTS-GATED: under plants a breakthrough raises `capitalStock` by the same
// proportion the legacy path raised `revenue`; the revenue write below runs only
// below the plants tier, where revenue is still the authoritative quantity.
/** Result of processing R&D innovations for all corporations in one turn, collecting bulk write ops for sector revenue boosts and state resource capacity updates. */
export interface RdInnovationResult {
  /** Bulk ops for sector revenue boosts (corporateSectors collection) */
  sectorBoostOps: Array<{ updateOne: UpdateOneModel<CorporateSector> }>;
  /** Bulk ops for state resource capacity boosts (stateResourceCapacity collection) */
  capacityBoostOps: Array<{
    updateOne: {
      filter: { stateId: string };
      update: { $inc: Record<string, number>; $set: Record<string, unknown> };
    };
  }>;
  /** Number of innovations that triggered this turn */
  innovationsTriggered: number;
}

/** Every extractable resource produced by a sector's active strategy, with its supply rate. */
function getStrategyExtractableResources(
  sectorType: string,
  strategyId: string | undefined
): Array<{ resource: ExtractableResource; supply: number }> {
  const strategies = SECTOR_STRATEGIES[sectorType as keyof typeof SECTOR_STRATEGIES];
  if (!strategies) return [];

  const strategy = strategyId
    ? strategies.find((s) => s.id === strategyId)
    : strategies.find((s) => s.id === "standard");
  if (!strategy) return [];

  const out: Array<{ resource: ExtractableResource; supply: number }> = [];
  for (const resource of EXTRACTABLE_RESOURCES) {
    const supply = (strategy.supply as Partial<Record<string, number>>)[resource] ?? 0;
    if (supply > 0) out.push({ resource, supply });
  }
  return out;
}

/**
 * Process R&D innovations for all corporations.
 * Fires every RD_INNOVATION_INTERVAL turns.
 *
 * Innovation probability = min(1, rdScore / RD_INNOVATION_SCORE_THRESHOLD).
 * At score 200, guaranteed; at 100, 50%; at 0, no chance.
 *
 * Extraction corps (type === "extraction"):
 *   - Pick a random sector, boost its revenue by 1-5% (scaling with rdScore).
 *   - Grow the state's deposit of the sector's binding resource only when the
 *     sector is deposit-constrained, never past 3x the seeded deposit (see
 *     rules/rdDepositGrowth.ts).
 *
 * Regular corps (all other types):
 *   - Pick a random sector, boost its revenue by 1-10%.
 *
 * All boosts are permanent revenue increases applied as $inc on the sector
 * document. Notifications are sent to the CEO's user for each breakthrough.
 */
export function processRdInnovations(
  lookups: CorporationLookups,
  turn: number,
  now: Date,
  // Injectable [0,1) source, same pattern as decideNppAction
  // (src/lib/npp/actionAi.ts) — defaults to Math.random, read at call time so
  // `vi.spyOn(Math, "random")` in existing tests keeps working unchanged.
  // The turn-path caller passes a seeded stream instead (see
  // turnPhaseRegistry.ts) per the "never Math.random() in turn paths"
  // doctrine (src/lib/events/substrate/rng.ts).
  rng: () => number = Math.random,
  /**
   * `marketSystemMode >= "plants"`. Under plants the turn processor RESTATES
   * `sector.revenue` from `capitalStock × mixPrice` every turn, so a `$inc` on
   * revenue is erased on the next tick — the breakthrough would simply not
   * happen. The boost is therefore applied to `capitalStock` instead (see the
   * write below). Defaults to false so every non-plants caller and every
   * existing test keeps the legacy revenue behaviour byte-identical.
   */
  plantsEnabled: boolean = false,
  /** Seeded deposits that bound research growth; pass `seedDepositLookup(gameState.preset)`. */
  seedDeposits: SeedDepositLookup = seedDepositLookup(undefined)
): RdInnovationResult {
  const sectorBoostOps: RdInnovationResult["sectorBoostOps"] = [];
  const capacityBoostOps: RdInnovationResult["capacityBoostOps"] = [];
  let innovationsTriggered = 0;

  if (turn % RD_INNOVATION_INTERVAL !== 0) {
    return { sectorBoostOps, capacityBoostOps, innovationsTriggered: 0 };
  }

  // stateId → resource → accumulated units. Multiple extraction breakthroughs
  // in the same state stack before writing to avoid $inc op collisions.
  const capacityBoostsByState = new Map<string, Partial<Record<ExtractableResource, number>>>();

  for (const corp of lookups.corporations) {
    const rdScore = corp.rdScore ?? 0;
    if (rdScore <= 0) continue;

    const probability = Math.min(1, rdScore / RD_INNOVATION_SCORE_THRESHOLD);
    if (rng() > probability) continue;

    const sectors = lookups.sectorsByCorp.get(corp._id.toString()) ?? [];
    if (sectors.length === 0) continue;

    const isExtraction = corp.type === "extraction";

    // For extraction corps, prefer the sector with the smallest producible output fraction — R&D capacity
    // boosts are most valuable where extraction is already constrained. Missing
    // utilization entry = unconstrained (treated as 1.0). Break equal constraints
    // with the injected RNG. Fall back to random
    // for non-extraction corps where capacity is irrelevant.
    let sector;
    if (isExtraction) {
      const index = extractionRdTargetIndex(
        sectors.map(
          (candidate) =>
            lookups.extractionCapacityUtilBySector.get(candidate._id.toString())?.utilization
        ),
        rng
      );
      if (index === null) continue;
      sector = sectors[index];
    } else {
      sector = sectors[Math.floor(rng() * sectors.length)];
    }

    // Mag is uniformly random across [MIN, MAX]: rdScore only governs how often a breakthrough fires, not its size. Score-weighted magnitude made high-rd corps always cap-hit, dominating Growth.
    const magnitudeRoll = rng();
    const boostPercent = isExtraction
      ? RD_EXTRACTION_BOOST_MIN +
        magnitudeRoll * (RD_EXTRACTION_BOOST_MAX - RD_EXTRACTION_BOOST_MIN)
      : RD_REGULAR_BOOST_MIN + magnitudeRoll * (RD_REGULAR_BOOST_MAX - RD_REGULAR_BOOST_MIN);

    // sector.revenue is persisted in the corp's local currency post-v0.2.6.
    // boostPercent is unitless, so boostAmount is already local — the $inc on
    // corporateSectors.revenue takes local. No FX conversion needed here
    // (prior code wrapped anchorToCorpCapital and inflated JP/UK boosts by
    // the corp's FX rate — ~150× for JPY).
    const boostAmount = sector.revenue * boostPercent;

    if (plantsEnabled) {
      // PLANTS: the breakthrough is new PLANT, not a revenue nameplate.
      // The turn processor rewrites `revenue` from `capitalStock × mixPrice`
      // every turn, so a legacy revenue boost is erased on the next tick.
      // Applying the same percentage to the STOCK reproduces the intended boost
      // in units: deltaUnits = capitalStock × boostPercent. No FX, no RPU
      // lookup, and correct after a D9 rescale.
      //
      // FREE capacity: no `buildQueue` entry and no `costPaidAnchor`, since
      // nothing was bought and there is no CIP to recognise or refund.
      //
      // A sector with no stock is skipped: there is no plant to improve, and
      // seeding one would conjure capacity from a percentage of zero.
      const stock =
        typeof sector.capitalStock === "number" && Number.isFinite(sector.capitalStock)
          ? sector.capitalStock
          : 0;
      const deltaCapacity = stock * boostPercent;
      if (deltaCapacity <= 0) continue;

      sectorBoostOps.push({
        updateOne: {
          filter: { _id: sector._id },
          update: plantChangePipeline(
            sector,
            Math.round(deltaCapacity * 100) / 100,
            { updatedAt: now },
            { wholePlants: lookups.wholePlantsOn === true }
          ),
        },
      });
    } else {
      if (boostAmount <= 0) continue;

      sectorBoostOps.push({
        updateOne: {
          filter: { _id: sector._id },
          update: {
            $inc: { revenue: Math.round(boostAmount) },
            $set: { updatedAt: now },
          },
        },
      });
    }
    innovationsTriggered++;

    // Extraction-specific: grow the state's deposit of the resource binding
    // this mine, bounded by its seed. Only applies to states that already have
    // a cap doc; "uncapped" legacy states don't need boosts and we don't
    // auto-create docs mid-turn.
    let depositGrew = false;
    if (isExtraction) {
      const capResources = lookups.stateResourceCapacityByState.get(sector.stateId);
      if (capResources !== undefined) {
        const util = lookups.extractionCapacityUtilBySector.get(sector._id.toString());
        const existing = capacityBoostsByState.get(sector.stateId) ?? {};
        const binding = util?.bindingResource ?? null;
        const growth = binding
          ? rdDepositGrowth({
              utilization: util?.utilization,
              bindingResource: binding,
              recipeResources: getStrategyExtractableResources(
                sector.sectorType,
                sector.strategyId
              ).map(({ resource }) => resource),
              currentDeposit: (capResources[binding] ?? 0) + (existing[binding] ?? 0),
              seedDeposit: seedDeposits(sector.countryId, sector.stateId)?.[binding],
              growthFraction:
                RD_CAPACITY_BOOST_MIN_PCT +
                rng() * (RD_CAPACITY_BOOST_MAX_PCT - RD_CAPACITY_BOOST_MIN_PCT),
            })
          : null;
        if (growth) {
          existing[growth.resource] = (existing[growth.resource] ?? 0) + growth.increase;
          capacityBoostsByState.set(sector.stateId, existing);
          depositGrew = true;
        }
      }
    }

    // Notify the CEO's user (corp.userId == CEO's user per requireCeo
    // convention — transfers update both together).
    if (corp.ceoId && !corp.ceoVacant) {
      const boostDisplayPercent = Math.round(boostPercent * 100);
      const where = getStateDisplayName(corp.countryId, sector.stateId);
      const title = `R&D breakthrough at ${corp.name}`;
      const message = depositGrew
        ? `Research paid off in ${where}: revenue there is up ${boostDisplayPercent}% and the state's resource capacity grew.`
        : `Research paid off in ${where}: revenue there is up ${boostDisplayPercent}%.`;

      void createNotifications([
        {
          userId: corp.userId,
          type: "rd_breakthrough",
          title,
          message,
          metadata: {
            corporationId: corp._id.toString(),
            sectorId: sector._id.toString(),
            stateId: sector.stateId,
            boostPercent: boostDisplayPercent,
            boostType: isExtraction ? "extraction" : "regular",
            rdScore,
            turn,
          },
        },
      ]);
    }
  }

  // Emit one $inc per (state, resource) pair — per-resource increments are
  // independent, so a single updateOne per state with multiple $inc keys works
  // but we stay one-op-per-resource for clarity with the existing pattern.
  for (const [stateId, resources] of capacityBoostsByState) {
    const inc: Record<string, number> = {};
    for (const [resource, amount] of Object.entries(resources)) {
      if (amount && amount > 0) inc[`resources.${resource}`] = amount;
    }
    if (Object.keys(inc).length > 0) {
      capacityBoostOps.push({
        updateOne: {
          filter: { stateId },
          update: {
            $inc: inc,
            $set: { updatedAt: now },
          },
        },
      });
    }
  }

  return { sectorBoostOps, capacityBoostOps, innovationsTriggered };
}
