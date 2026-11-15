import {
  getEraComposition,
  getEraPositions,
  demographicCategories,
} from "@/lib/seeds/demographicCategories";
import {
  deriveGroupPopulations,
  deriveGroupTurnout,
  deriveGroupLeanFromLayer1,
  type Layer1Config,
} from "@/lib/seeds/stateDemographicsPure";
import { calculateStateLean, getDisplayLean } from "@/lib/utils/demographics";
import type { CensusGroupView } from "@/lib/db/types";
import type { EraId } from "@/lib/seeds/presetSelector";
import type { CountryLayer1Model } from "@/lib/seeds/international/types";

/*
 * The authored voter-group composition model, kept only so the calibration
 * anchors keep measuring it while the census electorate is calibrated. Nothing
 * outside this folder reads it.
 */

interface Layer1Entry {
  share: number;
  turnout: number;
  economicLean: number;
  socialLean: number;
}
type Layer1Table = Record<string, Record<string, Layer1Entry>>;
interface CompositionWeight {
  dim: string;
  key: string;
  w: number;
}
interface CohortComposition {
  id: string;
  name: string;
  weights: CompositionWeight[];
  civicMultiplier: number;
}
interface GroupModelConfig {
  era: EraId;
  countryId: string;
  stateId: string;
  dims: string[];
  categoryId?: string;
  seed?: Layer1Config;
  layer1: Layer1Table;
  cohorts: CohortComposition[];
  regionLeanDecimals?: 1 | 2;
}
interface GroupModelLean {
  cohorts: Array<{
    id: string;
    name: string;
    populationShare: number;
    votingPoolShare: number;
    economicLean: number;
    socialLean: number;
    turnout: number;
  }>;
  stateEconomicLean: number;
  stateSocialLean: number;
  stateDisplayLean: number;
}

const US_DIMS = ["race", "age", "education", "wealth", "ideology"] as const;

/** Overlay the era positions and turnout rates onto a seed Layer1Config. */
export function groupConfigFromSeed(
  stateId: string,
  countryId: string,
  era: EraId,
  seed: Layer1Config
): GroupModelConfig {
  const dims: string[] = [...US_DIMS];
  const comp = getEraComposition(era);
  // State-aware: per-state era overrides (STATE_POSITION_OVERRIDES) apply so the
  // positions match the seed path for this state.
  const eraPositions = getEraPositions(era, stateId);
  // Use state-specific positions if available, falling back to era-global
  const statePositions = seed.positions;
  const seedDims: Record<string, unknown> = { ...seed };
  const eraRates: Record<string, unknown> = { ...comp.turnoutRates };
  const layer1 = {} as Layer1Table;
  for (const dim of dims) {
    const out: Record<
      string,
      { share: number; turnout: number; economicLean: number; socialLean: number }
    > = {};
    for (const [key, share] of Object.entries(
      (seedDims[dim] as Record<string, number> | undefined) ?? {}
    )) {
      const pos = statePositions?.[dim]?.[key] ??
        (
          eraPositions as Record<
            string,
            Record<string, { economicLean: number; socialLean: number }>
          >
        )[dim]?.[key] ?? { economicLean: 0, socialLean: 0 };
      const turnout = (eraRates[dim] as Record<string, number> | undefined)?.[key] ?? 55;
      out[key] = { share, turnout, economicLean: pos.economicLean, socialLean: pos.socialLean };
    }
    layer1[dim] = out;
  }
  const cohorts = comp.groupIds.map((id) => {
    const c = comp.voterGroupComposition[id];
    const name = demographicCategories[0].groups.find((g) => g.id === id)?.name ?? id;
    return {
      id,
      name,
      weights: (c?.weights ?? []).map((w) => ({
        dim: w.dim as string,
        key: w.key,
        w: w.w,
      })),
      civicMultiplier: c?.civicMultiplier ?? 1,
    };
  });
  return { era, countryId, stateId, dims, categoryId: "voterGroups", seed, layer1, cohorts };
}

/** Reduce a config to the engine's Layer1Config (shares only). */
function toLayer1Config(cfg: GroupModelConfig): Layer1Config {
  if (!cfg.seed) throw new Error(`No US census seed for ${cfg.stateId}`);
  const { positions: _positions, ...shares } = cfg.seed;
  return shares;
}

function positionsTable(
  cfg: GroupModelConfig
): Record<string, Record<string, { economicLean: number; socialLean: number }>> {
  const out: Record<string, Record<string, { economicLean: number; socialLean: number }>> = {};
  for (const dim of cfg.dims) {
    out[dim] = {};
    for (const [key, e] of Object.entries(cfg.layer1[dim])) {
      out[dim][key] = { economicLean: e.economicLean, socialLean: e.socialLean };
    }
  }
  return out;
}

const positionsFromConfig = positionsTable;

/** Extract the global baseline turnout table (per dim/key) from the editor config. */
function turnoutTable(cfg: GroupModelConfig): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const dim of cfg.dims) {
    out[dim] = {};
    for (const [key, e] of Object.entries(cfg.layer1[dim])) {
      out[dim][key] = e.turnout;
    }
  }
  return out;
}

const turnoutFromConfig = turnoutTable;

/** Extract the per-cohort composition (Layer-1 weights + civic multiplier). */
function compositionTable(
  cfg: GroupModelConfig
): Record<string, { weights: { dim: string; key: string; w: number }[]; civicMultiplier: number }> {
  const out: Record<
    string,
    { weights: { dim: string; key: string; w: number }[]; civicMultiplier: number }
  > = {};
  for (const arch of cfg.cohorts) {
    out[arch.id] = {
      weights: arch.weights.map((w) => ({ dim: w.dim, key: w.key, w: w.w })),
      civicMultiplier: arch.civicMultiplier,
    };
  }
  return out;
}

/**
 * Build an GroupModelConfig from a CountryLayer1Model for a specific region.
 * Works for any country (UK/DE/JP/IE/BR/CN) by reading the model's census,
 * turnoutRates, positions, and composition tables.
 */
export function groupConfigFromCountryModel(
  model: CountryLayer1Model,
  regionId: string,
  era: EraId,
  cohortNames: Record<string, string>
): GroupModelConfig {
  const layer1 = {} as Layer1Table;
  const regionCensus = model.census[regionId] ?? {};
  const context = model.regionalContext?.[regionId];
  for (const dim of model.dims) {
    const out: Record<
      string,
      { share: number; turnout: number; economicLean: number; socialLean: number }
    > = {};
    for (const [key, share] of Object.entries(regionCensus[dim] ?? {})) {
      const turnout = model.turnoutRates[dim]?.[key] ?? 55;
      const pos = model.positions[dim]?.[key] ?? { economicLean: 0, socialLean: 0 };
      out[key] = {
        share,
        turnout,
        economicLean: pos.economicLean + (context?.economicLean ?? 0),
        socialLean: pos.socialLean + (context?.socialLean ?? 0),
      };
    }
    layer1[dim] = out;
  }
  const cohorts = model.groupIds.map((id) => ({
    id,
    name: cohortNames[id] ?? id,
    weights: (model.composition[id]?.weights ?? []).map((w) => ({
      dim: w.dim,
      key: w.key,
      w: w.w,
    })),
    civicMultiplier: model.composition[id]?.civicMultiplier ?? 1,
  }));
  return {
    era,
    countryId: model.countryId,
    stateId: regionId,
    dims: model.dims,
    categoryId: model.categoryId,
    layer1,
    cohorts,
    ...(model.regionLeanDecimals ? { regionLeanDecimals: model.regionLeanDecimals } : {}),
  };
}

/**
 * Generic compute that works for any country/dims by reading only from cfg.
 * Mirrors the logic of deriveCountryGroupPopulations/Lean/Turnout but reads
 * from cfg.layer1 entries (share, turnout, economicLean, socialLean).
 */
export function groupLeanGeneric(cfg: GroupModelConfig): GroupModelLean {
  // One decimal, like the model seed path's clampLean.
  function clampLean(v: number): number {
    return Math.max(-5, Math.min(5, Math.round(v * 10) / 10));
  }

  // Population (voting-pool-weighted, then normalized)
  const rawPop: Record<string, number> = {};
  for (const arch of cfg.cohorts) {
    let score = 0;
    for (const { dim, key, w } of arch.weights) {
      const entry = cfg.layer1[dim]?.[key];
      if (!entry) continue;
      score += w * (entry.share / 100) * (entry.turnout / 100);
    }
    score *= arch.civicMultiplier;
    rawPop[arch.id] = score;
  }
  const popTotal = Object.values(rawPop).reduce((a, b) => a + b, 0) || 1;

  // Economic/Social lean + turnout per cohort
  const rows = cfg.cohorts.map((arch) => {
    const populationShare = Math.round((rawPop[arch.id] / popTotal) * 10000) / 100;

    // lean: Σ(w × share/100 × lean) / Σ(w × share/100)
    let wSum = 0,
      eSum = 0,
      sSum = 0;
    for (const { dim, key, w } of arch.weights) {
      const entry = cfg.layer1[dim]?.[key];
      if (!entry) continue;
      const weight = w * (entry.share / 100);
      wSum += weight;
      eSum += weight * entry.economicLean;
      sSum += weight * entry.socialLean;
    }
    const economicLean = wSum > 0 ? clampLean(eSum / wSum) : 0;
    const socialLean = wSum > 0 ? clampLean(sSum / wSum) : 0;

    // turnout: weighted average of entry.turnout by w, × civicMultiplier
    const tw = arch.weights.reduce((a, c) => a + c.w, 0) || 1;
    let baseTurnout = 0;
    for (const { dim, key, w } of arch.weights) {
      const entry = cfg.layer1[dim]?.[key];
      if (!entry) continue;
      baseTurnout += entry.turnout * (w / tw);
    }
    const turnout = Math.round(Math.max(25, Math.min(85, baseTurnout * arch.civicMultiplier)));

    return { id: arch.id, name: arch.name, populationShare, economicLean, socialLean, turnout };
  });

  const poolTotal =
    rows.reduce((s, r) => s + (r.populationShare / 100) * (r.turnout / 100), 0) || 1;
  const cohorts = rows.map((r) => ({
    id: r.id,
    name: r.name,
    populationShare: r.populationShare,
    votingPoolShare:
      Math.round((((r.populationShare / 100) * (r.turnout / 100)) / poolTotal) * 10000) / 100,
    economicLean: r.economicLean,
    socialLean: r.socialLean,
    turnout: r.turnout,
  }));

  // State lean: turnout-weighted average across cohorts
  let weightSum = 0,
    econSum = 0,
    socialSum = 0;
  for (const r of rows) {
    const w = (r.populationShare / 100) * (r.turnout / 100);
    weightSum += w;
    econSum += w * r.economicLean;
    socialSum += w * r.socialLean;
  }
  // UK 1991's audited preview retains the two-decimal calculateStateLean mean.
  // Other models keep their calibrated one-decimal preview until audited.
  const scale = 10 ** (cfg.regionLeanDecimals ?? 1);
  const stateEconomicLean =
    weightSum > 0
      ? Math.max(-5, Math.min(5, Math.round((econSum / weightSum) * scale) / scale))
      : 0;
  const stateSocialLean =
    weightSum > 0
      ? Math.max(-5, Math.min(5, Math.round((socialSum / weightSum) * scale) / scale))
      : 0;

  return {
    cohorts,
    stateEconomicLean,
    stateSocialLean,
    stateDisplayLean: getDisplayLean(stateEconomicLean, stateSocialLean),
  };
}

/**
 * US region lean from the group model. Cohort leans use
 * deriveGroupLeanFromLayer1; population and turnout use
 * deriveGroupPopulations/deriveGroupTurnout; the state lean uses
 * calculateStateLean (turnout-weighted).
 */
export function groupLeanUs(cfg: GroupModelConfig): GroupModelLean {
  const era = cfg.era;
  const seed = toLayer1Config(cfg);
  const comp = getEraComposition(era);
  const positionsOverride = positionsFromConfig(cfg);
  const turnoutOverride = turnoutFromConfig(cfg);
  // Feed the editor's turnout + composition edits into the engine so the US
  // preview reflects them (and matches what a reseed with these overrides
  // writes). Unedited configs reproduce the static composition, so this is a
  // no-op until the admin actually changes weights/civic/turnout.
  const override = {
    positions: positionsOverride,
    turnout: turnoutOverride,
    composition: compositionTable(cfg),
  };
  const populations = deriveGroupPopulations(seed, era, override);

  const groups: CensusGroupView["groups"] = {};
  const rows = comp.groupIds.map((id) => {
    const lean = deriveGroupLeanFromLayer1(id, seed, era, positionsOverride, override, cfg.stateId);
    const turnout = deriveGroupTurnout(
      id,
      seed,
      comp.defaultTurnouts[id] ?? 55,
      era,
      turnoutOverride as Parameters<typeof deriveGroupTurnout>[4],
      override
    );
    const populationShare = Math.round((populations[id] ?? 0) * 100) / 100;
    groups[id] = {
      population: populationShare,
      economicLean: lean.economicLean,
      socialLean: lean.socialLean,
      turnout,
    };
    return {
      id,
      name: cfg.cohorts.find((a) => a.id === id)?.name ?? id,
      populationShare,
      economicLean: lean.economicLean,
      socialLean: lean.socialLean,
      turnout,
      _poolWeight: (populationShare / 100) * (turnout / 100),
    };
  });

  const poolTotal = rows.reduce((s, r) => s + r._poolWeight, 0) || 1;
  const cohorts = rows.map((r) => ({
    id: r.id,
    name: r.name,
    populationShare: r.populationShare,
    votingPoolShare: Math.round((r._poolWeight / poolTotal) * 10000) / 100,
    economicLean: r.economicLean,
    socialLean: r.socialLean,
    turnout: r.turnout,
  }));

  const stateDemo: CensusGroupView = {
    _id: cfg.stateId,
    countryId: cfg.countryId as CensusGroupView["countryId"],
    categoryWeights: { voterGroups: 100 },
    groups,
    lastUpdated: new Date(),
  };
  const lean = calculateStateLean(stateDemo, demographicCategories);
  return {
    cohorts,
    stateEconomicLean: lean.economicLean,
    stateSocialLean: lean.socialLean,
    stateDisplayLean: getDisplayLean(lean.economicLean, lean.socialLean),
  };
}
