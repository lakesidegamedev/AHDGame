/**
 * Country-and-era GDP-per-capita baselines for campaign income and action costs.
 *
 * PORTABLE RULES (see `rules/currency.ts`): plain data in, plain data out. No
 * database, clock, randomness, env, network, or async.
 *
 * Campaign income (`getIncomeGdpScalar`) and action costs (`getFundMultiplier`)
 * scale regional GDP per capita against a national baseline. The baseline must
 * be keyed by (country, era), not country alone: a country's `State.gdp`
 * denomination differs by era (e.g. JPY millions in the modern seed, USD-anchored
 * millions in 1953), so a single fixed per-country number pins the scalar to its
 * clamp.
 *
 * WHAT THE NUMBERS ARE: for each playable country and era bundle, the
 * population-weighted mean regional GDP per capita
 * (SUM gdp x 1e6 / SUM population) over exactly the region bundle that seeder
 * writes, multiplied by the seed-time reconcile scalar where the pre-1999 era
 * gate applies, so the units match `State.gdp` by construction and the average
 * region resolves a ~1.0 (neutral) scalar.
 *
 * `gdpBaseline.table.test.ts` recomputes every cell from the seed modules and
 * fails if a seed edit leaves the table stale. To recalibrate: edit seeds, run
 * the table test, copy the recomputed values, and have the result reviewed
 * (balance-sensitive: worldsim).
 *
 * A new country without a row throws from the resolver, deliberately, so it can
 * never silently inherit a mismatched US denomination.
 *
 * That throw is NOT contained to the offending country:
 * - `/profile` calls `calculateFullFundDistribution` for every character, so one
 *   missing row 500s that page for its players.
 * - The turn processor loops every character with no per-character catch and
 *   writes only after the loop, and `runPhase` aborts on throw, so one missing
 *   row costs EVERY player that turn's campaign income, plus `partyGOTV` and
 *   `caucusTax`.
 *
 * `gdpBaselineCoverage.guard.test.ts` pins the row set against the region
 * bundles on disk for every era, so a new country fails a test rather than a
 * player's page and everyone else's payout.
 */

import type { EraId } from "@/lib/seeds/presetSelector";
import { eraForPreset } from "@/lib/seeds/presetSelector";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import { aggregateNationalGdp } from "@/lib/utils/nationalGdp";
import { GDP_DENOMINATION_1953 } from "@/lib/seeds/reference/gdpDenomination";

export type GdpBaselineUnit = "local" | "usd";

/**
 * Playable countries with an explicit baseline. Resolving any other country
 * throws instead of silently pricing in USD.
 *
 * ⚠️ `status` is NOT the gate. DD and RU carry `status: "coming-soon"` but a
 * 1953 world seeds and plays them. Whether a country needs a row is decided by
 * whether a world can seed regions for it, pinned in
 * `gdpBaselineCoverage.guard.test.ts`. SCO and WAL rows serve their latent
 * secession bundles.
 */
export type GdpBaselineCountry =
  "US" | "UK" | "DE" | "JP" | "IE" | "NG" | "CN" | "DD" | "RU" | "SCO" | "WAL";

export interface GdpBaselineResolution {
  /** National GDP per capita in the same unit as the era's `State.gdp`. */
  baseline: number;
  /** Era family the preset resolved to (e.g. "1953-default" -> "1953"). */
  era: EraId;
  /** Preset id of the region bundle the value was derived from. */
  bundlePreset: string;
  /** Denomination of `baseline`: "usd" only for USD-anchored 1953 seeds. */
  unit: GdpBaselineUnit;
}

/**
 * Authoritative baseline table: national GDP per capita per playable country
 * and era, derived from the era's `State.gdp` seed bundle (see module doc).
 *
 * Every (country, era) resolves to a LITERAL, including the cells a seeder has
 * no distinct bundle for: IE/NG repeat 2019 in 2027, DD repeats 1979 after
 * reunification, RU repeats 2019 in 1991. Those are written out here rather
 * than left to a runtime fallback, so a lookup can never return `undefined` and
 * turn into a NaN scalar downstream. `gdpBaseline.table.test.ts` recomputes the
 * derivable cells and asserts the repeats.
 */
const GDP_BASELINE_TABLE: Record<GdpBaselineCountry, Record<EraId, number>> = {
  US: {
    "1953": 2_557,
    "1979": 11_618,
    "1991": 24_929,
    "1999": 34_605,
    "2007": 45_683,
    "2019": 69_618,
    "2023": 80_058,
    "2027": 89_514,
  },
  UK: {
    "1953": 274,
    "1979": 4_379,
    "1991": 10_432,
    "1999": 15_734,
    "2007": 23_547,
    "2019": 29_734,
    "2023": 31_329,
    "2027": 35_057,
  },
  DE: {
    "1953": 2_715,
    "1979": 20_380,
    "1991": 20_038,
    "1999": 25_609,
    "2007": 30_760,
    "2019": 45_479,
    "2023": 45_479,
    "2027": 50_668,
  },
  JP: {
    // Modern cells are yen (local); 1953 is USD-anchored (unit "usd").
    "1953": 277,
    "1979": 1_964_804,
    "1991": 3_789_956,
    "1999": 3_966_701,
    "2007": 4_051_515,
    "2019": 4_172_222,
    "2023": 4_172_222,
    "2027": 4_486_839,
  },
  IE: {
    // No 2027 region bundle: seeder falls back to 2019, mirrored here.
    "1953": 115,
    "1979": 2_810,
    "1991": 8_775,
    "1999": 25_401,
    "2007": 43_379,
    "2019": 90_928,
    "2023": 90_928,
    "2027": 90_928,
  },
  NG: {
    // Modern cells are naira (local); 1953 is USD-anchored (unit "usd").
    // 1979 inherits the seed-time reconcile of oversized regional authoring.
    // 1991 matches the corrected authored regional GDP basis (see module doc).
    // No 2027 region bundle: seeder falls back to 2019, mirrored here.
    "1953": 113,
    "1979": 324,
    "1991": 6_630,
    "1999": 3_206_751,
    "2007": 3_724_138,
    "2019": 3_669_401,
    "2023": 3_677_130,
    "2027": 3_669_401,
  },
  CN: {
    // Modern cells are yuan (local); 1953 is USD-anchored (unit "usd").
    // 1979 inherits the seed-time reconcile uplift (scalar ~1.38) of
    // undersized regional authoring against the authored national GDP —
    // calibration review required on any reseed. Unlike IE/NG, CN seeds an
    // explicit 2027 bundle, so every cell below is bundle-native.
    "1953": 57,
    "1979": 568,
    // Re-derived after population reconciliation; regional GDP is unchanged.
    "1991": 1_865,
    "1999": 7_341,
    "2007": 21_028,
    "2019": 98_268,
    "2023": 98_268,
    "2027": 110_339,
  },
  DD: {
    // The GDR exists only in the divided-Germany eras. `seedDDRegions` wires a
    // bundle for exactly two presets — 1953 (`ddRegions1953`) and 1979
    // (`ddRegions`, the Länder model) — and an EMPTY bundle for 2019, which is
    // what every unified era falls back to. Both live cells are DDM (local),
    // per `GDP_DENOMINATION_1953`.
    "1953": 2_717,
    "1979": 10_976,
    // Reunification: no region bundle and no authored national GDP from 1991
    // on, so there is nothing to derive these from. They repeat the 1979 cell
    // rather than being absent, for the same reason IE/NG spell out their 2027
    // repeat: every (country, era) must resolve to a literal. A DD character
    // row that outlives a reseed into a unified era then prices against the
    // last era DD actually had, instead of throwing on a page render — the
    // failure this row was added for.
    "1991": 10_976,
    "1999": 10_976,
    "2007": 10_976,
    "2019": 10_976,
    "2023": 10_976,
    "2027": 10_976,
  },
  RU: {
    // `seedRURegions` wires `ruRegions1953` to 1953 and `ruRegions` to 1979, with
    // every remaining era taking the `2019-default` fallback — the same
    // `ruRegions` bundle. So 1991 onward are bundle-identical to 2019, and all
    // but 1991 are derived from it directly; only the pre-1999 reconcile makes
    // 1979 differ. 1991 is the one repeat, for the reason noted on its cell.
    //
    // ⚠️ THE 1953 CELL IS NOT COMPARABLE TO THE LATER ONES. 1953 is authored in
    // pre-1961 rubles (national 1.029T SUR) and the modern bundle in post-1961
    // rubles (439.5B in 1979), which is why the 1953 per-capita is ~3x the
    // 1979 one rather than a third of it. Both are `local`; the revaluation is
    // in the seeds, not a transcription slip here. Do not "fix" 1953 upward.
    "1953": 6_930,
    // Seed-time reconcile uplift (scalar ~1.249) of undersized regional
    // authoring against the authored national GDP — calibration review
    // required on any reseed.
    "1979": 2_264,
    // 1991 is a repeat of 2019, not a derivation: the USSR has no authored
    // national GDP for 1991 (that era's budget set carries only AT/FI/GR
    // forward from 1979) while the reconcile gate still covers `era < 1999`.
    // The bundle is the same `ruRegions` 2019 uses and 2019 takes no
    // reconcile, so the 2019 cell is the honest value.
    "1991": 1_813,
    "1999": 1_813,
    "2007": 1_813,
    "2019": 1_813,
    "2023": 1_813,
    "2027": 1_813,
  },
  SCO: {
    // One latent bundle inserted on secession; every era repeats its 2019 value.
    "1953": 29_963,
    "1979": 29_963,
    "1991": 29_963,
    "1999": 29_963,
    "2007": 29_963,
    "2019": 29_963,
    "2023": 29_963,
    "2027": 29_963,
  },
  WAL: {
    // Same as SCO: one latent bundle, every era repeats its 2019 value.
    "1953": 23_344,
    "1979": 23_344,
    "1991": 23_344,
    "1999": 23_344,
    "2007": 23_344,
    "2019": 23_344,
    "2023": 23_344,
    "2027": 23_344,
  },
};

/**
 * Eras whose cell was derived from a bundle other than `<era>-default`,
 * because the seeder maps that era onto a different bundle.
 *
 * Keeping this as data rather than a chain of `if`s is what stopped RU being
 * mis-reported: RU takes the `2019-default` fallback for five separate eras,
 * and a hand-written condition for each is where a wrong answer hides.
 */
const BUNDLE_PRESET_OVERRIDES: Partial<Record<GdpBaselineCountry, Partial<Record<EraId, string>>>> =
  {
    // No 2027 bundle: the seeder falls back to 2019 (see module doc).
    IE: { "2027": "2019-default" },
    NG: { "2027": "2019-default" },
    // DD seeds regions in the divided-Germany eras only; every later cell
    // repeats 1979, so that is the bundle the value actually came from.
    DD: {
      "1991": "1979-default",
      "1999": "1979-default",
      "2007": "1979-default",
      "2019": "1979-default",
      "2023": "1979-default",
      "2027": "1979-default",
    },
    // SCO and WAL have one latent bundle, so every era repeats the 2019 cell.
    SCO: {
      "1953": "2019-default",
      "1979": "2019-default",
      "1991": "2019-default",
      "1999": "2019-default",
      "2007": "2019-default",
      "2023": "2019-default",
      "2027": "2019-default",
    },
    WAL: {
      "1953": "2019-default",
      "1979": "2019-default",
      "1991": "2019-default",
      "1999": "2019-default",
      "2007": "2019-default",
      "2023": "2019-default",
      "2027": "2019-default",
    },
    // RU authors two bundles; everything outside 1953/1979 takes the
    // `2019-default` fallback.
    RU: {
      "1991": "2019-default",
      "1999": "2019-default",
      "2007": "2019-default",
      "2023": "2019-default",
      "2027": "2019-default",
    },
  };

/** Preset id of the region bundle behind each (country, era) cell. */
function bundlePresetFor(country: GdpBaselineCountry, era: EraId): string {
  return BUNDLE_PRESET_OVERRIDES[country]?.[era] ?? `${era}-default`;
}

/**
 * Resolve the campaign GDP-per-capita baseline for a country in a world's era.
 *
 * @param countryId playable country id (US/UK/DE/JP/IE/NG/CN/DD/RU/SCO/WAL).
 * @param preset world reset preset (e.g. "1953-default"); defaults to
 *   `DEFAULT_SEED_PRESET` ("2019-default"). Callers without a world to ask
 *   (client previews, unit tests) get modern-era behavior — the same scale
 *   the old hardcoded table used. Runtime money paths MUST pass the world's
 *   `gameState.preset` so historical worlds price in their own denomination.
 * @throws when the country has no explicit baseline (unknown or not yet
 *   playable). Loud by design: falling back to a US value would silently
 *   misprice every income/cost scalar for that country.
 */
export function resolveCampaignGdpBaseline(
  countryId: string,
  // Optional (never defaulted): callers with no world pass nothing and get the
  // modern era; runtime money paths pass the world's gameState.preset.
  preset?: string
): GdpBaselineResolution {
  const eraPreset = preset ?? DEFAULT_SEED_PRESET;
  // Own-property lookup, not `[countryId]`: a country id that collides with an
  // Object.prototype key ("constructor", "toString", "valueOf", "__proto__")
  // otherwise resolves the inherited member, sails past the guard below with a
  // truthy `row`, and returns `baseline: undefined` — which turns into a NaN
  // scalar the callers happily persist. Fail closed on anything not authored.
  const row = Object.hasOwn(GDP_BASELINE_TABLE, countryId)
    ? (GDP_BASELINE_TABLE as Record<string, Record<EraId, number> | undefined>)[countryId]
    : undefined;
  if (!row) {
    throw new Error(
      `resolveCampaignGdpBaseline: no GDP baseline for country "${countryId}" ` +
        `(preset "${eraPreset}"). Add an explicit per-era row before activating this country; ` +
        `falling back to a US-denominated value would misprice campaign income and costs.`
    );
  }
  const era = eraForPreset(eraPreset);
  return {
    baseline: row[era],
    era,
    bundlePreset: bundlePresetFor(countryId as GdpBaselineCountry, era),
    unit: era === "1953" ? (GDP_DENOMINATION_1953[countryId] ?? "local") : "local",
  };
}

/** Baseline value only — compat entry point for income/cost math. */
export function gdpBaselinePerCapita(countryId: string, preset?: string): number {
  return resolveCampaignGdpBaseline(countryId, preset ?? DEFAULT_SEED_PRESET).baseline;
}

/**
 * True when the country has an explicit baseline row (i.e. playable).
 *
 * Own-property only: `in` also answers true for inherited Object.prototype
 * keys, which would make this disagree with `resolveCampaignGdpBaseline` for
 * exactly the ids that resolver refuses.
 */
export function hasGdpBaseline(countryId: string): boolean {
  return Object.hasOwn(GDP_BASELINE_TABLE, countryId);
}

/** Read-only view of the table for tests and diagnostics. */
export function getGdpBaselineTable(): Record<GdpBaselineCountry, Record<EraId, number>> {
  return GDP_BASELINE_TABLE;
}

/**
 * Baseline a regional GDP-per-capita ratio is measured against.
 *
 * With no live figure (previews and tests with no world) it is the static
 * table cell, which equals the population-weighted national mean at world
 * start. With a live national GDP per capita it IS that figure, so the ratio
 * is regional versus national at every point in the game and income and cost
 * scalars stop drifting to their clamps as the whole economy grows.
 *
 * @throws when a live figure is supplied but is not a positive finite number:
 *   a missing national GDP must never quietly fall back to the start value.
 */
export function effectiveGdpBaseline(
  countryId: string,
  preset?: string,
  nationalGdpPerCapita?: number
): number {
  if (nationalGdpPerCapita === undefined) return gdpBaselinePerCapita(countryId, preset);
  if (!Number.isFinite(nationalGdpPerCapita) || nationalGdpPerCapita <= 0) {
    throw new Error(
      `effectiveGdpBaseline: invalid live national GDP per capita for "${countryId}" ` +
        `(${String(nationalGdpPerCapita)}); refusing to fall back to the era baseline.`
    );
  }
  return nationalGdpPerCapita;
}

/**
 * Live national GDP per capita for every country present in `states`, in the
 * same unit as `State.gdp`. Countries whose regions sum to no usable GDP are
 * left out, so `requireNationalGdpPerCapita` throws for them.
 */
export function nationalGdpPerCapitaIndex(
  states: Iterable<{ countryId?: string; gdp?: number; population: number }>
): Map<string, number> {
  const byCountry = new Map<string, { gdp?: number; population: number }[]>();
  for (const s of states) {
    const key = s.countryId ?? "US";
    const bucket = byCountry.get(key);
    if (bucket) bucket.push(s);
    else byCountry.set(key, [s]);
  }
  const index = new Map<string, number>();
  for (const [countryId, rows] of byCountry) {
    const { perCapita } = aggregateNationalGdp(rows);
    if (Number.isFinite(perCapita) && perCapita > 0) index.set(countryId, perCapita);
  }
  return index;
}

/**
 * Read one country from a `nationalGdpPerCapitaIndex`.
 *
 * @throws when the country has no usable regional GDP. Callers pricing live
 *   money must not continue on a guess.
 */
export function requireNationalGdpPerCapita(
  index: ReadonlyMap<string, number>,
  countryId: string
): number {
  const perCapita = index.get(countryId);
  if (perCapita === undefined) {
    throw new Error(
      `requireNationalGdpPerCapita: no usable regional GDP for country "${countryId}"; ` +
        `refusing to price campaign money without it.`
    );
  }
  return perCapita;
}

/** Single-country form of the index lookup; throws like `requireNationalGdpPerCapita`. */
export function nationalGdpPerCapitaFromStates(
  states: readonly { countryId?: string; gdp?: number; population: number }[],
  countryId: string
): number {
  return requireNationalGdpPerCapita(
    nationalGdpPerCapitaIndex(states.filter((s) => (s.countryId ?? "US") === countryId)),
    countryId
  );
}
