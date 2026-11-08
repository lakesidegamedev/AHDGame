/**
 * Shared preset-aware bundle selector.
 *
 * Seed lanes (regions, metrics, budgets, sector weights, demographics) use this
 * to pick the bundle authored for the reset preset. There is no fallback: a
 * preset without its own bundle stops the seed with a `SeedContractError`.
 */

import { SEED_PRESET_IDS, type SeedPresetId } from "@/lib/constants/turnTime";
import { missingPresetEntry } from "@/lib/seeds/contract/seedContractError";

type EraOfPreset<P> = P extends `${infer Year}-default` ? Year : never;

/**
 * The era of every shipping preset, derived from `SEED_PRESET_IDS` so a new
 * preset adds its era here and every `Record<EraId, ...>` table stops
 * compiling until it covers the new era.
 */
export type EraId = EraOfPreset<SeedPresetId>;

/** Every era id, oldest first. Non-empty tuple so it can feed `z.enum`. */
export const SEED_ERA_IDS = SEED_PRESET_IDS.map((preset) =>
  preset.slice(0, 4)
) as unknown as readonly [EraId, ...EraId[]];

export type ResetPresetId =
  | "1953-default"
  | "1979-default"
  | "1991-default"
  | "1999-default"
  | "2007-default"
  | "2019-default"
  | "2023-default"
  | "2027-default"
  | "empty"
  | "2019-no-parties"
  | string;

/**
 * Variants of the 2019 world that seed its data with a different party setup.
 * They are the same world, not other presets, so they read the 2019 bundle.
 */
const PRESET_DATA_ALIASES: Readonly<Record<string, SeedPresetId>> = {
  empty: "2019-default",
  "2019-no-parties": "2019-default",
};

/** The preset whose authored data a world of `preset` seeds. */
export function dataPresetFor(preset: string): string {
  return PRESET_DATA_ALIASES[preset] ?? preset;
}

/**
 * The bundle authored for `preset`. Throws `SeedContractError` when the preset
 * has none: another preset's bundle is never a substitute.
 *
 * `label` names the seed lane (e.g. "regions:TR") so the error says which
 * dataset is missing.
 */
export function selectPresetBundle<T>(
  preset: string,
  bundles: Partial<Record<ResetPresetId, T>>,
  label: string
): T {
  const bundle = bundles[dataPresetFor(preset) as ResetPresetId];
  if (bundle == null) throw missingPresetEntry(preset, label);
  return bundle;
}

/**
 * Non-throwing variant for optional overlays and render paths: the preset's own
 * bundle, or `undefined` when it has none. Never another preset's bundle.
 */
export function selectPresetBundleOptional<T>(
  preset: string,
  bundles: Partial<Record<ResetPresetId, T>>
): T | undefined {
  return bundles[dataPresetFor(preset) as ResetPresetId] ?? undefined;
}

const ERA_MAP: Record<string, EraId> = {
  "1953-default": "1953",
  "1979-default": "1979",
  "1991-default": "1991",
  "1999-default": "1999",
  "2007-default": "2007",
  "2019-default": "2019",
  "2023-default": "2023",
  "2027-default": "2027",
  empty: "2019",
  "2019-no-parties": "2019",
};

/**
 * Map a preset to its "era family". Presets sharing an era can reuse the
 * same data bundle. `empty` and `2019-no-parties` follow the 2019 era.
 */
export function eraForPreset(preset: string): EraId {
  return ERA_MAP[preset] ?? "2019";
}

/**
 * The canonical preset id for an era — the inverse of {@link eraForPreset},
 * choosing the `<year>-default` id for each era family.
 *
 * Era-continuity callers need this because the era-keyed data bundles are
 * addressed by PRESET, not by era: a world that has drifted past its seed era
 * must look up the bundle for the era it has reached rather than the one it
 * started in. Going through this map (instead of building `${era}-default` by
 * hand) keeps the two directions provably in sync — the round-trip is asserted
 * in `presetSelector.test.ts`.
 */
const PRESET_FOR_ERA_MAP: Record<EraId, ResetPresetId> = {
  "1953": "1953-default",
  "1979": "1979-default",
  "1991": "1991-default",
  "1999": "1999-default",
  "2007": "2007-default",
  "2019": "2019-default",
  "2023": "2023-default",
  "2027": "2027-default",
};

export function presetForEra(era: EraId): ResetPresetId {
  return PRESET_FOR_ERA_MAP[era];
}

/**
 * Returns true when the preset belongs to a Cold-War era in which the Warsaw-Pact
 * one-party states (HU/PL/RO/YU/BG/CS) and the CPSU / Soviet Union still existed
 * as such — i.e. the 1953 and 1979 eras. By the 1991 era the bloc governments had
 * collapsed (Warsaw Pact dissolved July 1991) and later eras use the successor
 * democracies + the modern Russian Federation, so those structures must NOT seed
 * there (refs #3269). This mirrors the RU-regions era gate in bootstrapGameWorld.
 */
export function isEasternBlocEra(preset: string): boolean {
  const era = eraForPreset(preset);
  return era === "1953" || era === "1979";
}

/**
 * Presets whose fresh world is MEANT to start in the live pre-iteration
 * "founding" phase (`GameState.preIteration.active`), so a normal admin reset
 * produces a working founding cycle without anyone remembering to tick a flag.
 *
 * Why this is preset-scoped rather than global: the founding phase only makes
 * sense where the authored roster deliberately leaves the playable legislatures
 * EMPTY, to be filled by the cycle-0 founding election. Measured against
 * `getPresetSeats(preset)` on this branch:
 *
 *   1953-default   360 authored seats — US house 75 / senate 96 / governor 48
 *                  are the *priors* pool, and `bootstrapGameWorld` explicitly
 *                  skips the executive backfill under `preIteration`. Chambers
 *                  start vacant BY DESIGN and the founding election seats them.
 *   1979-default   138 authored seats — RU/DD structures only; the US/UK
 *                  chambers have no authored roster at all. Same vacant-roster
 *                  shape as 1953, so founding is required for a valid world.
 *   1991/1999/     ~1004-1015 authored seats each — every chamber ships a full
 *   2007/2019/     historical roster that seats at bootstrap. Defaulting the
 *   2023           founding phase on here would blank those rosters and replace
 *                  a correct historical world with a synthetic one. Left OFF.
 *
 * Callers treat an explicit `preIteration` option as authoritative; this only
 * supplies the default when the caller says nothing.
 */
export function presetDefaultsToFoundingPhase(
  preset: string,
  startingParties: "default" | "none" = "default"
): boolean {
  return (
    preset === "1953-default" ||
    preset === "1979-default" ||
    (preset === "1991-default" && startingParties === "none")
  );
}

/**
 * Returns true when the preset is one of the canonical era presets that
 * has explicit data bundles. Use this to skip per-state overrides for
 * unknown presets without falling back to the wrong era.
 */
export function isKnownPreset(preset: string): boolean {
  return (
    preset === "1953-default" ||
    preset === "1979-default" ||
    preset === "1991-default" ||
    preset === "1999-default" ||
    preset === "2007-default" ||
    preset === "2019-default" ||
    preset === "2023-default" ||
    preset === "2027-default" ||
    preset === "empty" ||
    preset === "2019-no-parties"
  );
}
