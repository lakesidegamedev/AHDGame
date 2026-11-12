import { createHash } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import { COUNTRY_ORDER, type CountryId } from "@/lib/constants/countries";
import type { EffectIntent } from "@/lib/crises/v2/effectModule";
import type { TradeEmbargo } from "@/lib/db/types/tradeEmbargo";
import { applyCapacityDestructionSpec } from "@/lib/livingConflict/capacityDestruction";
import {
  raiseCrisisPopulationOrders,
  type PopulationLossRequest,
  type ReceptionRequest,
} from "@/lib/livingConflict/crisisPopulationOrders";
import {
  MAX_OUTSTANDING_SHARE,
  MAX_REGION_CAPITAL_SHARE,
  MAX_REPAIR_TURNS,
} from "@/lib/livingConflict/rules/capacityDestruction";
import { tradeEmbargoesCollection } from "@/lib/db/repositories/tradeEmbargoes";

export interface WorldIntentTargets {
  stateIds: string[];
  countryIds: string[];
  crisisId?: ObjectId;
  turn?: number;
  /** Response role per country, for crises that name who a restriction targets. */
  rolesByCountry?: Readonly<Record<string, string>>;
}

type Kind<K extends EffectIntent["kind"]> = Extract<EffectIntent, { kind: K }>;

export interface WorldIntentBatch {
  populationLoss: Kind<"populationLoss">[];
  capitalStock: Kind<"capitalStock">[];
  tradeRestriction: Kind<"tradeRestriction">[];
  /** Migration intents that name an origin country; the rest stay with the regional handler. */
  reception: Kind<"migration">[];
}

const CAPITAL_CONFLICT_KEY = "crisis-v2";
const DEFAULT_OUTSTANDING_SHARE = 0.2;
const DEFAULT_REPAIR_TURNS = 96;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function embargoId(crisisId: ObjectId, commodity: string, source: string, target: string) {
  const digest = createHash("sha256")
    .update(`${crisisId.toHexString()}:v2:${commodity}:${source}:${target}`)
    .digest("hex");
  return new ObjectId(digest.slice(0, 24));
}

async function writeCapitalStock(
  db: Db,
  intents: readonly Kind<"capitalStock">[],
  targets: WorldIntentTargets
): Promise<void> {
  if (!targets.crisisId || targets.turn === undefined) return;
  const shares = new Map<string, number>();
  let maxOutstandingShare = DEFAULT_OUTSTANDING_SHARE;
  let repairTurns = DEFAULT_REPAIR_TURNS;
  let repairCostMultiplier = 1;
  for (const intent of intents) {
    const regions = intent.regionId ? [intent.regionId] : targets.stateIds;
    for (const regionId of regions) {
      shares.set(regionId, (shares.get(regionId) ?? 0) + intent.fraction);
    }
    maxOutstandingShare = Math.max(maxOutstandingShare, intent.maxOutstandingShare ?? 0);
    repairTurns = Math.max(repairTurns, intent.repairTurns ?? 0);
    repairCostMultiplier = Math.max(repairCostMultiplier, intent.repairCostMultiplier ?? 0);
  }
  const regions = [...shares]
    .map(([regionId, share]) => ({
      regionId,
      capitalShare: clamp(share, 0, MAX_REGION_CAPITAL_SHARE),
    }))
    .filter((region) => region.capitalShare > 0);
  if (regions.length === 0) return;
  await applyCapacityDestructionSpec(db, {
    spec: {
      regions,
      maxOutstandingShare: clamp(maxOutstandingShare, 0.01, MAX_OUTSTANDING_SHARE),
      repairTurns: clamp(Math.round(repairTurns), 1, MAX_REPAIR_TURNS),
      repairCostMultiplier: Math.max(0, repairCostMultiplier),
    },
    conflictKey: CAPITAL_CONFLICT_KEY,
    resolutionId: `${targets.crisisId.toHexString()}:${targets.turn}`,
    outcomeId: "crisis-v2",
    outcomeLabel: "Crisis damage",
  });
}

async function writeTradeRestrictions(
  db: Db,
  intents: readonly Kind<"tradeRestriction">[],
  targets: WorldIntentTargets
): Promise<number> {
  if (!targets.crisisId || targets.turn === undefined) return 0;
  const { crisisId, turn } = targets;
  const eligible = new Set<string>(COUNTRY_ORDER);
  const ops: { _id: ObjectId; doc: TradeEmbargo }[] = [];
  for (const intent of intents) {
    const roles = targets.rolesByCountry ?? {};
    const targeted = Object.entries(roles)
      .filter(([country, role]) => role === intent.targetRole && eligible.has(country))
      .map(([country]) => country);
    const sources = (intent.sourceCountryIds ?? targets.countryIds).filter(
      (country) => eligible.has(country) && !targeted.includes(country)
    );
    for (const source of sources) {
      for (const target of targeted) {
        const _id = embargoId(crisisId, intent.commodity, source, target);
        ops.push({
          _id,
          doc: {
            _id,
            sourceCountry: source as CountryId,
            targetCountry: target as CountryId,
            commodity: intent.commodity,
            direction: "both",
            mode: "block",
            origin: "crisis",
            createdBy: crisisId,
            createdTurn: turn,
            expiresTurn: turn + intent.durationTurns,
            sourceCrisisId: crisisId,
            sourceOutcomeId: "crisis-v2",
          },
        });
      }
    }
  }
  if (ops.length === 0) return 0;
  await tradeEmbargoesCollection(db).bulkWrite(
    ops.map(({ _id, doc }) => ({
      updateOne: { filter: { _id }, update: { $setOnInsert: doc }, upsert: true },
    })),
    { ordered: false }
  );
  return ops.length;
}

/** Routes intents that reach population, capital stock and trade through their owning writers. */
export async function routeWorldIntents(
  db: Db,
  batch: WorldIntentBatch,
  targets: WorldIntentTargets
): Promise<number> {
  let handled = 0;
  if (batch.capitalStock.length > 0) {
    await writeCapitalStock(db, batch.capitalStock, targets);
    handled += batch.capitalStock.length;
  }
  if (batch.tradeRestriction.length > 0) {
    handled += await writeTradeRestrictions(db, batch.tradeRestriction, targets);
  }
  if (
    targets.crisisId &&
    targets.turn !== undefined &&
    (batch.populationLoss.length > 0 || batch.reception.length > 0)
  ) {
    const losses: PopulationLossRequest[] = batch.populationLoss.flatMap((intent) =>
      (intent.countryId ? [intent.countryId] : targets.countryIds).map((countryId) => ({
        countryId,
        fraction: intent.fraction,
      }))
    );
    const receptions: ReceptionRequest[] = batch.reception.flatMap((intent) =>
      targets.countryIds
        .filter((countryId) => countryId !== intent.fromCountryId)
        .map((destinationCountryId) => ({
          originCountryId: intent.fromCountryId as string,
          destinationCountryId,
          fraction: intent.fraction,
          serviceGdpShare: intent.serviceGdpShare,
          serviceTurns: intent.serviceTurns,
        }))
    );
    await raiseCrisisPopulationOrders(db, targets.crisisId, targets.turn, { losses, receptions });
    handled += losses.length + receptions.length;
  }
  return handled;
}
