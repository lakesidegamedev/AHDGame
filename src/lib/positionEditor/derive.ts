import { getEraComposition, getEraPositions } from "@/lib/seeds/demographicCategories";
import type { Layer1Config } from "@/lib/seeds/stateDemographicsPure";
import {
  bucketProfileLean,
  getBucketProfileForRegion,
  type BucketProfileSection,
} from "@/lib/demographics/bucketProfile";
import { deriveGranularElectorateUnits } from "@/lib/demographics/granularElectorate";
import { electorateMeanLean, type ElectorateLean } from "@/lib/demographics/electorateLean";
import { presetForEra } from "@/lib/seeds/presetSelector";
import { getDisplayLean } from "@/lib/utils/demographics";
import type { Layer1PositionOverlay, Layer1TurnoutOverlay } from "@/lib/db/types";
import type { EditorStateConfig, EditorLayer1Config, DerivedComposition, EraId } from "./types";
import type { CountryLayer1Model } from "@/lib/seeds/international/types";

const US_DIMS = ["race", "age", "education", "wealth", "ideology"] as const;

/** Build an editor config by overlaying DEMOGRAPHIC_POSITIONS + turnout rates onto a seed Layer1Config. */
export function editorConfigFromSeed(
  stateId: string,
  countryId: string,
  era: EraId,
  seed: Layer1Config
): EditorStateConfig {
  const dims: string[] = [...US_DIMS];
  const comp = getEraComposition(era);
  // State-aware: per-state era overrides (STATE_POSITION_OVERRIDES) apply so the
  // editor opens on the same positions the seed path uses for this state.
  const eraPositions = getEraPositions(era, stateId);
  // Use state-specific positions if available, falling back to era-global
  const statePositions = (seed as unknown as Record<string, unknown>).positions as
    Record<string, Record<string, { economicLean: number; socialLean: number }>> | undefined;
  const layer1 = {} as EditorLayer1Config;
  for (const dim of dims) {
    const out: Record<string, EditorLayer1Config[string][string]> = {};
    for (const [key, share] of Object.entries(
      (seed as unknown as Record<string, Record<string, number>>)[dim] ?? {}
    )) {
      const pos = statePositions?.[dim]?.[key] ??
        (
          eraPositions as Record<
            string,
            Record<string, { economicLean: number; socialLean: number }>
          >
        )[dim]?.[key] ?? { economicLean: 0, socialLean: 0 };
      const turnout =
        (comp.turnoutRates as unknown as Record<string, Record<string, number>>)[dim]?.[key] ?? 55;
      out[key] = {
        share,
        turnout,
        economicLean: pos.economicLean,
        socialLean: pos.socialLean,
        base: { share, economicLean: pos.economicLean, socialLean: pos.socialLean, turnout },
      };
    }
    layer1[dim] = out;
  }
  return { era, countryId, stateId, dims, layer1 };
}

export function editorPositionsTable(
  cfg: EditorStateConfig
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

/** Extract the global baseline turnout table (per dim/key) from the editor config. */
export function editorTurnoutTable(cfg: EditorStateConfig): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const dim of cfg.dims) {
    out[dim] = {};
    for (const [key, e] of Object.entries(cfg.layer1[dim])) {
      out[dim][key] = e.turnout;
    }
  }
  return out;
}

/**
 * Apply a stored override (positions + global turnout) onto an editor config
 * in place, so the editor reloads authored values. Per-state Layer-1 `share`
 * is left as census data.
 */
export function applyOverrideToEditorConfig(
  cfg: EditorStateConfig,
  override: {
    positions?: Record<string, Record<string, { economicLean: number; socialLean: number }>>;
    turnout?: Record<string, Record<string, number>>;
  }
): void {
  if (override.positions || override.turnout) {
    for (const dim of cfg.dims) {
      const pos = override.positions?.[dim];
      const tr = override.turnout?.[dim];
      for (const key of Object.keys(cfg.layer1[dim] ?? {})) {
        if (pos?.[key]) {
          cfg.layer1[dim][key].economicLean = pos[key].economicLean;
          cfg.layer1[dim][key].socialLean = pos[key].socialLean;
        }
        if (tr?.[key] !== undefined) cfg.layer1[dim][key].turnout = tr[key];
      }
    }
  }
}

/** Build an EditorStateConfig for one region of an international Layer-1 model. */
export function editorConfigFromCountryModel(
  model: CountryLayer1Model,
  regionId: string,
  era: EraId
): EditorStateConfig {
  const layer1 = {} as EditorLayer1Config;
  const regionCensus = model.census[regionId] ?? {};
  const context = model.regionalContext?.[regionId];
  for (const dim of model.dims) {
    const out: EditorLayer1Config[string] = {};
    for (const [key, share] of Object.entries(regionCensus[dim] ?? {})) {
      const turnout = model.turnoutRates[dim]?.[key] ?? 55;
      const pos = model.positions[dim]?.[key] ?? { economicLean: 0, socialLean: 0 };
      const economicLean = pos.economicLean + (context?.economicLean ?? 0);
      const socialLean = pos.socialLean + (context?.socialLean ?? 0);
      out[key] = {
        share,
        turnout,
        economicLean,
        socialLean,
        base: { share, economicLean, socialLean, turnout },
      };
    }
    layer1[dim] = out;
  }
  return { era, countryId: model.countryId, stateId: regionId, dims: model.dims, layer1 };
}

/** The distance each edited position and turnout sits from where the preset opened. */
function overlaysFromEditor(cfg: EditorStateConfig): {
  positions: Layer1PositionOverlay;
  turnout: Layer1TurnoutOverlay;
} {
  const positions: Layer1PositionOverlay = {};
  const turnout: Layer1TurnoutOverlay = {};
  for (const dim of cfg.dims) {
    for (const [key, e] of Object.entries(cfg.layer1[dim] ?? {})) {
      if (!e.base) continue;
      const dEcon = e.economicLean - e.base.economicLean;
      const dSoc = e.socialLean - e.base.socialLean;
      if (dEcon !== 0 || dSoc !== 0) {
        (positions[dim] ??= {})[key] = { economicLean: dEcon, socialLean: dSoc };
      }
      const dTurnout = e.turnout - e.base.turnout;
      if (dTurnout !== 0) (turnout[dim] ??= {})[key] = dTurnout;
    }
  }
  return { positions, turnout };
}

/** The editor's own entries as bucket rows, for a region with no census substrate. */
function sectionsFromEditor(cfg: EditorStateConfig): BucketProfileSection[] {
  return cfg.dims
    .map((dim) => ({
      dim,
      dimLabel: dim,
      buckets: Object.entries(cfg.layer1[dim] ?? {}).map(([key, e]) => ({
        id: `${dim}:${key}`,
        label: key,
        sharePct: e.share,
        economicLean: e.economicLean,
        socialLean: e.socialLean,
        turnout: e.turnout,
      })),
    }))
    .filter((section) => section.buckets.length > 0);
}

/** The shares typed into the editor (or the ones it opened with), renormalised within each dimension. */
function withEditorShares(
  sections: BucketProfileSection[],
  cfg: EditorStateConfig,
  which: "current" | "opening" = "current"
): BucketProfileSection[] {
  const shareOf = (dim: string, bucketId: string): number => {
    const entry = cfg.layer1[dim]?.[bucketId.slice(dim.length + 1)];
    return which === "opening" ? (entry?.base?.share ?? entry?.share ?? 0) : (entry?.share ?? 0);
  };
  return sections.map((section) => {
    const total = section.buckets.reduce((sum, b) => sum + shareOf(section.dim, b.id), 0);
    if (total <= 0) return section;
    return {
      ...section,
      buckets: section.buckets.map((b) => ({
        ...b,
        sharePct: (shareOf(section.dim, b.id) / total) * 100,
      })),
    };
  });
}

function clampLean(v: number): number {
  return Math.max(-5, Math.min(5, Math.round(v * 100) / 100));
}

/**
 * The region's lean with the edits applied. Position and turnout edits move the
 * census units themselves; a share edit moves only its own dimension's mean, so
 * each dimension's shift is added on top of the units' mean.
 */
function stateLeanWithEdits(
  cfg: EditorStateConfig,
  census: BucketProfileSection[] | null,
  edited: BucketProfileSection[],
  overlays: ReturnType<typeof overlaysFromEditor>
): ElectorateLean {
  const units = census
    ? deriveGranularElectorateUnits(
        cfg.countryId,
        cfg.stateId,
        presetForEra(cfg.era),
        null,
        overlays.positions,
        overlays.turnout
      )?.units
    : undefined;
  if (!census || !units?.length) {
    const lean = edited.map((section) => bucketProfileLean([section]));
    const n = Math.max(1, lean.length);
    return {
      economicLean: lean.reduce((sum, l) => sum + l.economicLean, 0) / n,
      socialLean: lean.reduce((sum, l) => sum + l.socialLean, 0) / n,
    };
  }
  const base = electorateMeanLean(
    units.map((u) => ({
      populationPct: u.share * 100,
      economicLean: u.economicLean,
      socialLean: u.socialLean,
      turnout: u.turnout,
    }))
  );
  let economicLean = base.economicLean;
  let socialLean = base.socialLean;
  const opening = withEditorShares(census, cfg, "opening");
  opening.forEach((section, i) => {
    const before = bucketProfileLean([section]);
    const after = bucketProfileLean([edited[i]]);
    economicLean += after.economicLean - before.economicLean;
    socialLean += after.socialLean - before.socialLean;
  });
  return { economicLean, socialLean };
}

/**
 * Preview a region with the edits applied: the census buckets the vote engine
 * counts, shifted by the editor's position and turnout edits, with the state
 * lean read off the same electorate units.
 */
export function computeDerivedComposition(cfg: EditorStateConfig): DerivedComposition {
  const overlays = overlaysFromEditor(cfg);
  const census = getBucketProfileForRegion(
    cfg.countryId,
    cfg.stateId,
    presetForEra(cfg.era),
    null,
    undefined,
    overlays.positions,
    overlays.turnout
  );
  const buckets = census ? withEditorShares(census, cfg) : sectionsFromEditor(cfg);
  const lean = stateLeanWithEdits(cfg, census, buckets, overlays);
  const stateEconomicLean = clampLean(lean.economicLean);
  const stateSocialLean = clampLean(lean.socialLean);
  return {
    buckets,
    stateEconomicLean,
    stateSocialLean,
    stateDisplayLean: getDisplayLean(stateEconomicLean, stateSocialLean),
  };
}
