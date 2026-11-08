import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import { getFederalBudgetCollection } from "@/lib/db/collections/federalBudget";
import { getStatesCollection } from "@/lib/db/collections/states";
import type { CountryId } from "@/lib/constants/countries";
import { createHash } from "node:crypto";
import { ObjectId, type AnyBulkWriteOperation, type Db } from "mongodb";
import { applyCrisisEffects } from "@/lib/crises/applyEffects";
import type { CommodityType } from "@/lib/constants/commodities";
import { getCountryModifiersCollection } from "@/lib/db/collections/countryModifiers";
import type { CrisisEffect, CrisisV2Output } from "@/lib/db/types/crisis";
import type { CountryModifier } from "@/lib/db/types/events";
import type { EffectIntent } from "@/lib/crises/v2/effectModule";
import {
  INVESTOR_CONFIDENCE_BASELINE,
  SOVEREIGN_CONFIDENCE_PREMIUM_MAX,
} from "@/lib/nationalization/constants";
import { defaultMarginEffectForApproval } from "@/lib/states/conditions/marginEffects";
import { routeWorldIntents, type WorldIntentBatch } from "./worldIntents";

export interface IntentTargets {
  stateIds: string[];
  countryIds: string[];
  /** Names the crisis whose demand modifiers are written. */
  crisisId?: ObjectId;
  turn?: number;
  /** Response role per country, for restrictions that name a target role. */
  rolesByCountry?: Readonly<Record<string, string>>;
}

export interface IntentRouting {
  applied: number;
  /** Intent kinds with no handler yet, with how many were dropped. */
  unsupported: Record<string, number>;
  /** Plant output cuts for the caller to persist with the crisis's other writes. */
  v2Output?: CrisisV2Output;
}

/** Sector whose plants make each commodity. Commodities with no entry cannot be shocked yet. */
const PRODUCER_SECTOR: Partial<Record<CommodityType, string>> = {
  energy: "energy",
  oil: "extraction",
  coal: "extraction",
  iron: "extraction",
  rare_earth: "extraction",
  natural_gas: "extraction",
  timber: "extraction",
  food: "agriculture",
  fertilizers: "agriculture",
  steel: "manufacturing",
  electronics: "manufacturing",
  plastics: "manufacturing",
  ordnance: "manufacturing",
  chemicals: "chemical_industries",
  pharmaceuticals: "chemical_industries",
  vehicles: "manufacturing_vehicles",
  freight: "logistics",
};

/** Unemployment points added per unit of migration fraction in the regions people leave. */
const MIGRATION_PUSH_POINTS = 100;
/** Growth points added per unit of migration fraction in the regions people go to. */
const MIGRATION_PULL_POINTS = 50;
/** A group is a share of the electorate, so its approval moves the national figure by about this much. */
const GROUP_APPROVAL_SHARE = 0.5;
/** Regional sector demand modifiers are summed and capped at this size elsewhere. */
const DEMAND_MODIFIER_LIMIT_PCT = 20;
/** Demand modifiers last this many turns, so one that is not renewed lapses on its own. */
const DEMAND_MODIFIER_TURNS = 2;
/** Vote-share points a point of approval is worth, from the regional-condition margin rule. */
const MARGIN_PER_APPROVAL_POINT = defaultMarginEffectForApproval(100) / 100;
export const MAX_PANIC_TURNS = 4;
/** Confidence points that equal one basis point of sovereign premium. */
const CONFIDENCE_POINTS_PER_BPS =
  INVESTOR_CONFIDENCE_BASELINE / (SOVEREIGN_CONFIDENCE_PREMIUM_MAX * 10_000);

function metricEffect(category: string, field: string, value: number): CrisisEffect {
  return {
    effectType: "tick",
    targetType: "metric",
    metricCategory: category,
    metricField: field,
    sectorType: null,
    strategyId: null,
    value,
    label: "Crisis",
  };
}

function approvalEffect(value: number): CrisisEffect {
  return {
    effectType: "tick",
    targetType: "approval",
    metricCategory: null,
    metricField: null,
    sectorType: null,
    strategyId: null,
    value,
    label: "Crisis",
  };
}

function legacyEffect(intent: EffectIntent): CrisisEffect | null {
  switch (intent.kind) {
    case "metric":
      return metricEffect(intent.category, intent.field, intent.delta);
    case "profitMargin":
      return {
        ...metricEffect("", "", intent.points),
        targetType: "profitMargin",
        metricCategory: null,
        metricField: null,
        sectorType: intent.sectorType,
        physicality: intent.physical ? "physical" : "financial",
      };
    case "inflation":
      return {
        ...metricEffect("", "", intent.delta),
        targetType: "inflation",
        metricCategory: null,
        metricField: null,
      };
    default:
      return null;
  }
}

/** Compounds fractional losses into one `$mul`, as the old engine did. */
async function applyGdpLoss(db: Db, stateIds: string[], fractions: number[]): Promise<void> {
  let factor = 1;
  for (const fraction of fractions) factor *= 1 - Math.max(0, Math.min(0.95, Math.abs(fraction)));
  if (factor >= 1 || stateIds.length === 0) return;
  const states = await getStatesCollection(db);
  await states.updateMany({ _id: { $in: stateIds } } as never, {
    $mul: { gdp: factor },
  });
}

function stableModifierId(crisisId: ObjectId, turn: number, countryId: string, sector: string) {
  const digest = createHash("sha256")
    .update(`${crisisId.toHexString()}:${turn}:demand:${countryId}:${sector}`)
    .digest("hex");
  return new ObjectId(digest.slice(0, 24));
}

/** Writes commodity demand shifts as expiring sector output-demand modifiers. */
async function writeDemandShifts(
  db: Db,
  pctBySector: ReadonlyMap<string, number>,
  targets: IntentTargets
): Promise<void> {
  if (!targets.crisisId || targets.turn === undefined || targets.countryIds.length === 0) return;
  const { crisisId, turn } = targets;
  const ops: AnyBulkWriteOperation<CountryModifier>[] = [];
  for (const [sectorType, rawPct] of pctBySector) {
    const pct = Math.max(-DEMAND_MODIFIER_LIMIT_PCT, Math.min(DEMAND_MODIFIER_LIMIT_PCT, rawPct));
    if (pct === 0) continue;
    for (const countryId of targets.countryIds) {
      const doc: CountryModifier = {
        _id: stableModifierId(crisisId, turn, countryId, sectorType),
        countryId,
        kind: "sectorOutputDemandModifier",
        sectorType,
        pct,
        appliedAtTurn: turn,
        expiresAtTurn: turn + DEMAND_MODIFIER_TURNS,
        sourceInstanceId: crisisId,
        createdAt: new Date(),
      };
      ops.push({
        updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true },
      });
    }
  }
  if (ops.length > 0) await getCountryModifiersCollection(db).bulkWrite(ops, { ordered: false });
}

async function applyMigration(
  db: Db,
  intents: readonly Extract<EffectIntent, { kind: "migration" }>[],
  targets: IntentTargets
): Promise<void> {
  const pushByRegion = new Map<string, number>();
  const pullByRegion = new Map<string, number>();
  let wide = 0;
  for (const intent of intents) {
    if (intent.fromRegionId) {
      pushByRegion.set(
        intent.fromRegionId,
        (pushByRegion.get(intent.fromRegionId) ?? 0) + intent.fraction
      );
    } else if (!intent.toRegionId) {
      wide += intent.fraction;
    }
    if (intent.toRegionId) {
      pullByRegion.set(
        intent.toRegionId,
        (pullByRegion.get(intent.toRegionId) ?? 0) + intent.fraction
      );
    }
  }
  // Internal migration follows regional unemployment and growth, so the push
  // and pull are applied to those metrics and the demographic flows move people.
  const writes: Promise<void>[] = [];
  if (wide > 0) {
    writes.push(
      applyCrisisEffects(
        db,
        [metricEffect("economic", "unemploymentRate", wide * MIGRATION_PUSH_POINTS)],
        targets.stateIds,
        targets.countryIds
      )
    );
  }
  for (const [regionId, fraction] of pushByRegion) {
    writes.push(
      applyCrisisEffects(
        db,
        [metricEffect("economic", "unemploymentRate", fraction * MIGRATION_PUSH_POINTS)],
        [regionId],
        targets.countryIds
      )
    );
  }
  for (const [regionId, fraction] of pullByRegion) {
    writes.push(
      applyCrisisEffects(
        db,
        [metricEffect("economic", "gdpGrowth", fraction * MIGRATION_PULL_POINTS)],
        [regionId],
        targets.countryIds
      )
    );
  }
  await Promise.all(writes);
}

/** Starts a panic of the given length in every active bank in the countries. */
export async function applyBankStress(db: Db, delta: number, countryIds: string[]): Promise<void> {
  const panicTurns = Math.min(MAX_PANIC_TURNS, Math.ceil(delta));
  if (panicTurns <= 0 || countryIds.length === 0) return;
  const corporations = await getCorporationsCollection(db);
  await corporations.updateMany(
    { "bankCharter.status": "active", countryId: { $in: countryIds as CountryId[] } },
    { $max: { "bankCharter.panicTurns": panicTurns } }
  );
}

/** Lowers investor confidence, which is what prices the sovereign borrowing premium. */
async function applyBondPressure(
  db: Db,
  deltaBps: number,
  countryIds: string[],
  turn: number | undefined
): Promise<void> {
  const points = deltaBps * CONFIDENCE_POINTS_PER_BPS;
  if (points === 0 || countryIds.length === 0) return;
  const next = {
    $max: [
      0,
      {
        $min: [
          100,
          {
            $subtract: [{ $ifNull: ["$investorConfidence", INVESTOR_CONFIDENCE_BASELINE] }, points],
          },
        ],
      },
    ],
  };
  const budgets = await getFederalBudgetCollection(db);
  await budgets.updateMany({ countryId: { $in: countryIds as CountryId[] } }, [
    {
      $set: {
        investorConfidence: next,
        ...(turn === undefined ? {} : { investorConfidenceUpdatedAtTurn: turn }),
      },
    },
  ]);
}

/**
 * Sends a crisis's intents to the system that owns each write: plant output via
 * `v2Output`, demand via expiring modifiers, migration via regional metrics,
 * bank panic, investor confidence, government approval, population orders,
 * capital destruction and trade embargoes through their owning writers. Callers
 * claim the turn first; the order, capital and embargo writers also key on the
 * crisis and turn, so a replay adds nothing. The output cuts are returned for the
 * caller to persist. Kinds with no handler are counted so a definition using one
 * is visible.
 */
export async function routeEffectIntents(
  db: Db,
  intents: readonly EffectIntent[],
  targets: IntentTargets
): Promise<IntentRouting> {
  const legacy: CrisisEffect[] = [];
  const gdpFractions: number[] = [];
  const cutPoints = new Map<string | null, number>();
  const demandPct = new Map<string, number>();
  const migration: Extract<EffectIntent, { kind: "migration" }>[] = [];
  const world: WorldIntentBatch = {
    populationLoss: [],
    capitalStock: [],
    tradeRestriction: [],
    reception: [],
  };
  let bankDelta = 0;
  let bondBps = 0;
  let approvalDelta = 0;
  const unsupported: Record<string, number> = {};
  const drop = (kind: string) => {
    unsupported[kind] = (unsupported[kind] ?? 0) + 1;
  };

  for (const intent of intents) {
    switch (intent.kind) {
      case "gdpLoss":
        gdpFractions.push(intent.fraction);
        break;
      case "plantCapacity": {
        const sector = intent.sectorType ?? null;
        cutPoints.set(sector, (cutPoints.get(sector) ?? 0) + intent.factor * 100);
        break;
      }
      case "commoditySupply": {
        const sector = PRODUCER_SECTOR[intent.commodity];
        if (!sector) drop(intent.kind);
        else cutPoints.set(sector, (cutPoints.get(sector) ?? 0) + intent.factor * 100);
        break;
      }
      case "commodityDemand": {
        const sector = PRODUCER_SECTOR[intent.commodity];
        if (!sector) drop(intent.kind);
        else demandPct.set(sector, (demandPct.get(sector) ?? 0) + intent.factor * 100);
        break;
      }
      case "migration":
        if (intent.fromCountryId) world.reception.push(intent);
        else migration.push(intent);
        break;
      case "populationLoss":
        world.populationLoss.push(intent);
        break;
      case "capitalStock":
        world.capitalStock.push(intent);
        break;
      case "tradeRestriction":
        world.tradeRestriction.push(intent);
        break;
      case "bankStress":
        bankDelta += intent.delta;
        break;
      case "bondYield":
        bondBps += intent.deltaBps;
        break;
      case "approval":
        approvalDelta += intent.group ? intent.delta * GROUP_APPROVAL_SHARE : intent.delta;
        break;
      case "electionSwing":
        approvalDelta -= intent.deltaPoints / MARGIN_PER_APPROVAL_POINT;
        break;
      default: {
        const effect = legacyEffect(intent);
        if (effect) legacy.push(effect);
        else drop(intent.kind);
      }
    }
  }

  const v2Output: CrisisV2Output | undefined =
    targets.turn === undefined
      ? undefined
      : {
          routedTurn: targets.turn,
          productionCuts: [...cutPoints]
            .filter(([, points]) => points !== 0)
            .map(([sectorType, points]) => ({ sectorType, points: Math.max(-100, points) })),
        };

  if (approvalDelta !== 0) legacy.push(approvalEffect(approvalDelta));
  if (targets.stateIds.length > 0 && legacy.length > 0) {
    await applyCrisisEffects(db, legacy, targets.stateIds, targets.countryIds);
  }
  if (gdpFractions.length > 0) await applyGdpLoss(db, targets.stateIds, gdpFractions);
  if (demandPct.size > 0) await writeDemandShifts(db, demandPct, targets);
  if (migration.length > 0) await applyMigration(db, migration, targets);
  const worldHandled = await routeWorldIntents(db, world, targets);
  if (bankDelta > 0) await applyBankStress(db, bankDelta, targets.countryIds);
  if (bondBps !== 0) await applyBondPressure(db, bondBps, targets.countryIds, targets.turn);

  const handled =
    legacy.length +
    gdpFractions.length +
    cutPoints.size +
    demandPct.size +
    migration.length +
    worldHandled +
    (bankDelta > 0 ? 1 : 0) +
    (bondBps !== 0 ? 1 : 0);
  return { applied: handled, unsupported, v2Output };
}
