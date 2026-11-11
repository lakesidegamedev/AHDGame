/**
 * Shell for the energy transition rules: reads the climate laws each country
 * has enacted and summarises the power fleet the rules price against. One
 * batch read per caller; everything else is in-memory.
 */
import type { Db } from "mongodb";
import type { StatePolicy } from "@/lib/db/types/statePolicy";
import type { DisasterEffectEntry } from "@/lib/crises/disasterMarginPenalty";
import { MODERN_ERA_LEGISLATURE_SPECS } from "@/lib/seeds/shared/modernEraLegislation";
import type { AggregatedTechEffects } from "@/lib/constants/techTree/effects";
import { COMMODITY_TYPES } from "@/lib/constants/commodities";
import {
  NO_TRANSITION_POLICY,
  applyTransitionAdjustment,
  openingVintageYear,
  sectorTransitionAdjustment,
  TRANSITION_LAW_SLUGS,
  cleanPowerShare,
  legacyOptionLevel,
  regionalPowerMix,
  renewablesReliabilityPenalty,
  type TransitionPolicy,
} from "./rules";
import { statePoliciesCollection } from "@/lib/db/repositories/statePolicies";

type PolicyKey = keyof TransitionPolicy;

interface LawRef {
  countryId: string;
  key: PolicyKey;
  legacy: boolean;
}

/** Every climate law id in both books, keyed to the country and policy it sets. */
function transitionLawRefs(): Map<string, LawRef> {
  const refs = new Map<string, LawRef>();
  for (const key of Object.keys(TRANSITION_LAW_SLUGS) as PolicyKey[]) {
    const slugs = TRANSITION_LAW_SLUGS[key];
    for (const countryId of ["US", "UK"])
      refs.set(`${countryId.toLowerCase()}.sec.${slugs.modern}`, { countryId, key, legacy: false });
    for (const spec of MODERN_ERA_LEGISLATURE_SPECS)
      refs.set(`${spec.prefix}_${slugs.legacy}`, {
        countryId: spec.prefix.toUpperCase(),
        key,
        legacy: true,
      });
  }
  return refs;
}

const LAW_REFS = transitionLawRefs();

/** Plain-data fold of national law records into a policy per country. */
export function foldTransitionPolicies(
  records: ReadonlyArray<Pick<StatePolicy, "legislationTypeId" | "policyOptionIndex" | "scope">>
): Map<string, TransitionPolicy> {
  const byCountry = new Map<string, TransitionPolicy>();
  for (const record of records) {
    if (record.scope === "state") continue;
    const ref = LAW_REFS.get(record.legislationTypeId);
    if (!ref) continue;
    const level = ref.legacy
      ? legacyOptionLevel(record.policyOptionIndex)
      : Math.max(0, Math.min(4, Math.round(record.policyOptionIndex ?? 0)));
    const policy = byCountry.get(ref.countryId) ?? { ...NO_TRANSITION_POLICY };
    policy[ref.key] = level;
    byCountry.set(ref.countryId, policy);
  }
  return byCountry;
}

/** countryId -> enacted climate law levels. Countries with none are absent. */
export async function loadTransitionPolicies(db: Db): Promise<Map<string, TransitionPolicy>> {
  const records = await statePoliciesCollection(db)
    .find(
      { legislationTypeId: { $in: [...LAW_REFS.keys()] } },
      { projection: { _id: 0, legislationTypeId: 1, policyOptionIndex: 1, scope: 1 } }
    )
    .toArray();
  return foldTransitionPolicies(records);
}

export interface PowerFleetSector {
  sectorType: string;
  strategyId?: string | null;
  stateId: string;
  countryId?: string | null;
  capitalStock?: number;
  revenue?: number;
}

const capacityOf = (sector: PowerFleetSector): number => {
  if (typeof sector.capitalStock === "number" && sector.capitalStock > 0)
    return sector.capitalStock;
  return typeof sector.revenue === "number" && sector.revenue > 0 ? sector.revenue : 0;
};

export interface PowerFleetSummary {
  /** countryId -> clean share of national power capacity. */
  cleanShareByCountry: Map<string, number>;
  /** stateId -> output fraction renewables lose for want of firming. */
  renewablesPenaltyByState: Map<string, number>;
}

/** Group power sectors by country and region and price both against the rules. */
export function summarisePowerFleet(sectors: Iterable<PowerFleetSector>): PowerFleetSummary {
  const byCountry = new Map<string, Array<{ strategyId: string | null; capacity: number }>>();
  const byState = new Map<string, Array<{ strategyId: string | null; capacity: number }>>();
  for (const sector of sectors) {
    if (sector.sectorType !== "energy") continue;
    const row = { strategyId: sector.strategyId ?? null, capacity: capacityOf(sector) };
    if (sector.countryId) {
      const list = byCountry.get(sector.countryId) ?? [];
      list.push(row);
      byCountry.set(sector.countryId, list);
    }
    const list = byState.get(sector.stateId) ?? [];
    list.push(row);
    byState.set(sector.stateId, list);
  }
  const cleanShareByCountry = new Map<string, number>();
  for (const [countryId, rows] of byCountry)
    cleanShareByCountry.set(countryId, cleanPowerShare(rows));
  const renewablesPenaltyByState = new Map<string, number>();
  for (const [stateId, rows] of byState) {
    const penalty = renewablesReliabilityPenalty(regionalPowerMix(rows));
    if (penalty > 0) renewablesPenaltyByState.set(stateId, penalty);
  }
  return { cleanShareByCountry, renewablesPenaltyByState };
}

/**
 * A standing output loss for renewables in one region, in the disaster effect
 * shape the corporation turn already applies (physical under plants).
 */
export function renewablesReliabilityEntry(penalty: number): DisasterEffectEntry {
  return {
    value: -penalty * 100,
    startTurn: 0,
    durationTurns: 0,
    sectorType: "energy",
    strategyId: "renewables",
    physicality: "physical",
    persistent: true,
  };
}

export interface EnergyTransitionContext {
  startingYear: number;
  policyByCountry: Map<string, TransitionPolicy>;
  cleanShareByCountry: Map<string, number>;
}

/** A sector's fleet build year: its own vintage, else the opening fleet's. */
export function sectorVintageYear(
  sector: { capacityVintageYear?: number | null; strategyId?: string | null },
  operatingType: string,
  startingYear: number
): number | null {
  if (typeof sector.capacityVintageYear === "number" && Number.isFinite(sector.capacityVintageYear))
    return sector.capacityVintageYear;
  return openingVintageYear(operatingType, sector.strategyId, startingYear);
}

/**
 * A sector's tech aggregate with ageing, climate law and recycling effects
 * folded into its input rates. Neutral when the world has not opted in.
 */
export function withEnergyTransition(
  effects: AggregatedTechEffects,
  context: EnergyTransitionContext | undefined,
  sector: {
    countryId?: string | null;
    strategyId?: string | null;
    capacityVintageYear?: number | null;
  },
  operatingType: string,
  currentYear: number | null | undefined
): AggregatedTechEffects {
  if (!context || currentYear == null) return effects;
  const countryId = sector.countryId ?? "";
  return applyTransitionAdjustment(
    effects,
    sectorTransitionAdjustment({
      operatingType,
      strategyId: sector.strategyId,
      currentYear,
      policy: context.policyByCountry.get(countryId) ?? NO_TRANSITION_POLICY,
      cleanShare: context.cleanShareByCountry.get(countryId) ?? 1,
      vintageYear: sectorVintageYear(sector, operatingType, context.startingYear),
    }),
    COMMODITY_TYPES
  );
}
