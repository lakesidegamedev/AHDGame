import {
  INCOME_TIERS,
  INCOME_TAX_KEYS,
  INCOME_TIER_LABELS,
} from "@/lib/budget/rules/incomeTaxTiers";
import { CAPITAL_GAINS_TAX_KEYS } from "@/lib/budget/rules/capitalGainsTax";
/**
 * Catalog registry — the read surface every consumer (projection, seeding,
 * cost UI, deleters) uses. Content lives in laws/*Laws.ts (transcribed).
 */

import { BASELINE_LEVEL_OVERRIDES_1991 } from "./seeds/baselineLevels1991";
import { POST_1991_FALLBACK_YEAR } from "@/lib/politicalMetrics/seeds/baselineAnchors";
import { DE_LAWS } from "@/lib/countries/de/data/deLaws";
import { CA_LAWS } from "./laws/caLaws";
import { JP_LAWS } from "@/lib/countries/jp/data/jpLaws";
import { CN_LAWS } from "@/lib/countries/cn/data/cnLaws";
import { DD_LAWS } from "./laws/ddLaws";
import { DD_LAND_LAWS } from "./laws/ddLandLaws";
import { RU_LAWS } from "./laws/ruLaws";
import { UK_LAWS } from "./laws/ukLaws";
import { US_LAWS } from "./laws/usLaws";
import { US_STATE_TAX_LAWS } from "./laws/usStateTaxLaws";
import {
  DD_MODERN_ERA_LAWS,
  RU_MODERN_ERA_LAWS,
  UK_MODERN_ERA_LAWS,
  US_MODERN_ERA_LAWS,
} from "./laws/modernEraLaws";
import type { LawCountryId, PoliticalLaw } from "./types";

/** Locked core catalogs (topology / RU↔DD cost parity). */
const CORE_CATALOGS: Record<LawCountryId, PoliticalLaw[]> = {
  US: US_LAWS,
  UK: UK_LAWS,
  RU: RU_LAWS,
  DD: DD_LAWS,
  DE: DE_LAWS,
  CA: CA_LAWS,
  JP: JP_LAWS,
  CN: CN_LAWS,
};

/** Regional-only sidecars (not part of the 109-law core). */
const REGIONAL_SIDECARS: Partial<Record<LawCountryId, PoliticalLaw[]>> = {
  DD: DD_LAND_LAWS,
  US: US_STATE_TAX_LAWS,
};

/**
 * National laws that open in a later era (2027 to 2050 bands). Kept out of the
 * locked core so its topology and secondary-touch rules stay as reviewed; every
 * one carries a `window`, so filing opens by year.
 */
const ERA_SIDECARS: Partial<Record<LawCountryId, PoliticalLaw[]>> = {
  US: US_MODERN_ERA_LAWS,
  UK: UK_MODERN_ERA_LAWS,
  RU: RU_MODERN_ERA_LAWS,
  DD: DD_MODERN_ERA_LAWS,
};

const CATALOGS: Record<LawCountryId, PoliticalLaw[]> = {
  US: [...CORE_CATALOGS.US, ...US_STATE_TAX_LAWS, ...US_MODERN_ERA_LAWS],
  UK: [...CORE_CATALOGS.UK, ...UK_MODERN_ERA_LAWS],
  RU: [...CORE_CATALOGS.RU, ...RU_MODERN_ERA_LAWS],
  DD: [...CORE_CATALOGS.DD, ...DD_LAND_LAWS, ...DD_MODERN_ERA_LAWS],
  DE: CORE_CATALOGS.DE,
  CA: CORE_CATALOGS.CA,
  JP: CORE_CATALOGS.JP,
  CN: CORE_CATALOGS.CN,
};

// Explicit anchors for all program laws make era coverage inspectable.
// Catalog objects are shared with core/sidecar views; attach the same metadata once.
for (const laws of Object.values(CATALOGS)) {
  for (const law of laws) {
    if (law.kind === "tax" || law.baselineLevelAnchors?.length) continue;
    const inherited = law.baselineLevel ?? 0;
    law.baselineLevelAnchors = [
      { year: 1953, level: inherited },
      { year: 1979, level: inherited },
      { year: 1991, level: BASELINE_LEVEL_OVERRIDES_1991[law.id] ?? inherited },
      // Later presets keep their pre-1991 level until a later era is authored.
      { year: POST_1991_FALLBACK_YEAR, level: inherited },
    ];
  }
}

const LAWS_BY_ID = new Map<string, PoliticalLaw>(
  Object.values(CATALOGS)
    .flat()
    .map((law) => [law.id, law])
);

/**
 * Whether the law exists in the given year: its window has opened. There is no
 * upper bound here on purpose. `until` stops filing, never existence, so an
 * enacted law keeps its record, budget line and effects. Seeding uses this.
 */
export function isLawActive(law: PoliticalLaw, year: number): boolean {
  if (!law.window) return true;
  return year >= law.window.from;
}

/**
 * Whether a NEW bill may file the law in the given year: from <= year < until.
 * Use on filing, proposal-picker and sponsorship paths only.
 */
export function isLawFileable(law: PoliticalLaw, year: number): boolean {
  if (!isLawActive(law, year)) return false;
  return law.window?.until == null || year < law.window.until;
}

/**
 * Filing check by legislation-type id, for the shared filing gate. Returns null
 * when the id is not a new-generation law, so the caller falls back to its own
 * era catalog. Income and capital-gains tier ids resolve to their parent law.
 */
export function isNewGenerationLawFileable(typeId: string, year: number): boolean | null {
  const law = newGenerationLawForType(typeId);
  return law ? isLawFileable(law, year) : null;
}

/**
 * Existence check by legislation-type id ({@link isLawActive}). Null when the
 * id is not a new-generation law.
 */
export function isNewGenerationLawActive(typeId: string, year: number): boolean | null {
  const law = newGenerationLawForType(typeId);
  return law ? isLawActive(law, year) : null;
}

/**
 * A windowed new-generation program law. A world that starts before its window
 * opens seeds no national row for it, so a missing row means level 0 ("l0").
 */
export function isUnseededEraLaw(typeId: string): boolean {
  const law = newGenerationLawForType(typeId);
  return law?.window != null && law.kind !== "tax";
}

/** First fileable year of a windowed new-generation law; undefined otherwise. */
export function newGenerationLawWindowFrom(typeId: string): number | undefined {
  return newGenerationLawForType(typeId)?.window?.from;
}

function newGenerationLawForType(typeId: string): PoliticalLaw | undefined {
  return LAWS_BY_ID.get(typeId.split(/__(?:income|capital)_/)[0]);
}

/**
 * Day-one enacted level at a year. Anchors win when declared; otherwise the
 * scalar baselineLevel; otherwise 0 (fully repealed). Interpolated linearly
 * then rounded to a whole level, clamped at both ends.
 */
export function baselineLevelFor(law: PoliticalLaw, year: number): 0 | 1 | 2 | 3 | 4 {
  const anchors = law.baselineLevelAnchors;
  if (!anchors || anchors.length === 0) return law.baselineLevel ?? 0;
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (year <= first.year) return first.level;
  if (year >= last.year) return last.level;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (year <= b.year) {
      const t = (year - a.year) / (b.year - a.year);
      return Math.round(a.level + (b.level - a.level) * t) as 0 | 1 | 2 | 3 | 4;
    }
  }
  return last.level;
}

/**
 * Omitting `year` returns the unfiltered catalog; passing a year filters to the
 * laws whose window has opened ({@link isLawActive}).
 *
 * The SEED path passes a year. The RUNTIME consumers (dynamics.ts,
 * enactedLevels.ts, politicalMetricsDynamics.ts, countryPoliticalMetrics.ts)
 * do not, and need not: a law whose window has not opened has no record and so
 * no level, and a law past `until` stays in force. Filing paths gate with
 * {@link isLawFileable}.
 */
/**
 * Accepts any country id, not just a LawCountryId: since the step-6 cutover the
 * 22 non-playables read the political board too, and the dynamics phase runs
 * for them. They have no new-generation catalog yet, so they get an EMPTY one —
 * which composes to a zero law-target, the self-heal adopts their seeded values
 * as equilibrium, and Bridge B's macro term is what actually moves their board.
 * Returning undefined here would crash that phase on the first non-playable.
 */
export function getCatalog(countryId: string, year?: number): PoliticalLaw[] {
  const all = CATALOGS[countryId as LawCountryId] ?? [];
  return (year == null ? all : all.filter((law) => isLawActive(law, year))).flatMap((law) =>
    law.taxPolicy?.taxType === "incomeTax"
      ? INCOME_TIERS.flatMap((tier) => [
          {
            ...law,
            id: law.id + "__income_" + tier,
            title: INCOME_TIER_LABELS[tier] + " Tax",
            taxPolicy: { ...law.taxPolicy!, taxType: INCOME_TAX_KEYS[tier] },
          },
          {
            ...law,
            id: law.id + "__capital_" + tier,
            title: INCOME_TIER_LABELS[tier] + " Capital Gains Tax",
            description:
              "Tax long-term share dividends and realized profits for the " +
              INCOME_TIER_LABELS[tier].toLowerCase() +
              " group.",
            taxPolicy: { ...law.taxPolicy!, taxType: CAPITAL_GAINS_TAX_KEYS[tier] },
          },
        ])
      : [law]
  );
}

/** Later-era national sidecar laws for a country (empty when none authored). */
export function getEraCatalog(countryId: string): PoliticalLaw[] {
  return ERA_SIDECARS[countryId as LawCountryId] ?? [];
}

/** Core catalog only — excludes regional sidecars (DD Land laws, etc.). */
export function getCoreCatalog(countryId: string, year?: number): PoliticalLaw[] {
  const all = CORE_CATALOGS[countryId as LawCountryId] ?? [];
  return year == null ? all : all.filter((law) => isLawActive(law, year));
}

/** Regional-only sidecar laws for a country (empty when none authored). */
export function getRegionalCatalog(countryId: string, year?: number): PoliticalLaw[] {
  const all = REGIONAL_SIDECARS[countryId as LawCountryId] ?? [];
  return year == null ? all : all.filter((law) => isLawActive(law, year));
}

export function getLaw(lawId: string): PoliticalLaw | null {
  const direct = LAWS_BY_ID.get(lawId);
  if (direct) return direct;
  return (
    Object.keys(CATALOGS)
      .flatMap((country) => getCatalog(country))
      .find((law) => law.id === lawId) ?? null
  );
}

/** All new-generation law ids including regional sidecars (used by seed deleters). */
export function getAllNewGenerationLawIds(): string[] {
  return [
    ...new Set([
      ...LAWS_BY_ID.keys(),
      ...Object.keys(CATALOGS).flatMap((country) => getCatalog(country).map((law) => law.id)),
    ]),
  ];
}
