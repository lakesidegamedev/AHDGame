import { getEraComposition, getEraPositions } from "@/lib/seeds/demographicCategories";
import type { Layer1Config } from "@/lib/seeds/stateDemographicsPure";
import type { EditorStateConfig, EditorLayer1Config, EraId } from "./types";
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
