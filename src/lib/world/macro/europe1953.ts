/**
 * European 1953 sphere-macro roster.
 *
 * GDP magnitudes use the same game units as Austria's oracle (AT = 7_500).
 * Values are strong defaults, not rails. Planned economies use lower
 * tradeExposure and never seed market corporations.
 *
 * AT/FI/GR/IE/FR/IT/SE/TR specs below are dormant reference: they are NOT in
 * {@link EUROPE_1953_MACRO_SPECS} and must not be seeded.
 *
 * ES is active: era-gated off both chambers, so full-autonomous misclassified
 * it. Its spec IS seeded. ES stays full-autonomous in later presets; this file
 * only contributes to the 1953-default manifest.
 */
import type { OperatingSectorType } from "@/lib/constants/corporations";
import type { WorldEntityId } from "@/lib/world/worldEntityManifest";
import { AUSTRIA_ENTITY_ID, getAustria1953MacroCountry } from "./austria1953";
import { buildMacroCountryFromSpec, type MacroCountrySeedSpec } from "./seedBuilder";
import type { MacroCountryState } from "./types";

/** Market neutrals / Western fringe retained as dormant reference specs. */
export const FINLAND_ENTITY_ID = "FI";
export const GREECE_ENTITY_ID = "GR";
export const IRELAND_ENTITY_ID = "IE";

/**
 * CountryId-backed market economies re-promoted to full-autonomous.
 * Entity ids retained for dormant macro-spec reference / future migration.
 * ES is the exception: demoted back to sphere-macro for 1953-default only
 *, see the file-level doc comment above.
 */
export const FRANCE_ENTITY_ID = "FR";
export const ITALY_ENTITY_ID = "IT";
export const SPAIN_ENTITY_ID = "ES";
export const SWEDEN_ENTITY_ID = "SE";
export const TURKEY_ENTITY_ID = "TR";

/** Planned / socialist economies (CountryId-backed cold-war stubs). */
export const POLAND_ENTITY_ID = "PL";
export const CZECHOSLOVAKIA_ENTITY_ID = "CS";
export const HUNGARY_ENTITY_ID = "HU";
export const ROMANIA_ENTITY_ID = "RO";
export const BULGARIA_ENTITY_ID = "BG";
export const YUGOSLAVIA_ENTITY_ID = "YU";

// Union-republic weights. Deliberately NOT copies of the satellites': a union
// republic has no consumer or financial sector to speak of, so the weight that
// would sit in retail/financial elsewhere goes to heavy industry and extraction.

/** Matches sectorSeedWeights1953 ES (Franco autarky → Pact of Madrid 1953). */
const ES_WEIGHTS: Partial<Record<OperatingSectorType, number>> = {
  agriculture: 25,
  manufacturing: 18,
  construction: 10,
  energy: 10,
  extraction: 6, // Vizcaya iron; Río Tinto
  logistics: 4,
  financial: 4,
  retail: 4,
  real_estate: 3,
  defense: 3,
  telecommunications: 2,
  media: 2,
  healthcare: 2,
  manufacturing_vehicles: 1, // SEAT founded 1950
  chemical_industries: 1,
  media_entertainment: 1,
  technology: 0,
};

/**
 * Authored 1953 specs. Populations: national censuses / UN early-1950s.
 * GDP: relative Maddison-scale sizing anchored to Austria = 7_500.
 *
 * Active roster excludes IE/FR/IT/SE/TR and Eastern bloc PL/CS/HU/RO/BG/YU
 * plus union republics UKR/BLR/BAL, whose specs live in
 * {@link DORMANT_REPROMOTED_EUROPE_1953_MACRO_SPECS}.
 */
export const EUROPE_1953_MACRO_SPECS: readonly MacroCountrySeedSpec[] = [
  {
    entityId: SPAIN_ENTITY_ID,
    displayName: "Spain",
    economicSystem: "market",
    // 1950 census ≈ 28.2M.
    population: 28_200_000,
    // Mid economy: Franco autarky recovery; ~2.2× Austria (below Italy, above Sweden).
    annualGdpGameUnits: 16_500,
    fiscalCapacity: 0.18, // extractive but thin fiscal base under autarky
    stability: 0.72, // Franco dictatorship; 1953 Concordat + US bases pact
    // Autarky still binds; Pact of Madrid opens limited US leakage.
    tradeExposure: 0.22,
    sectorWeights: ES_WEIGHTS,
    resources: {
      iron: 12, // Vizcaya
      coal: 8,
      // Río Tinto copper / potash via rare_earth channel.
      rare_earth: 6,
      timber: 3,
      oil: 0,
      natural_gas: 0,
    },
  },
];

/** Full European Tier-2 roster including the Austria oracle. */
export const EUROPE_1953_MACRO_ENTITY_IDS: readonly WorldEntityId[] = EUROPE_1953_MACRO_SPECS.map(
  (spec) => spec.entityId
);

export const PLANNED_EUROPE_1953_MACRO_ENTITY_IDS: readonly WorldEntityId[] =
  EUROPE_1953_MACRO_SPECS.filter((spec) => spec.economicSystem === "planned").map(
    (spec) => spec.entityId
  );

const SPEC_BY_ID = new Map(EUROPE_1953_MACRO_SPECS.map((spec) => [spec.entityId, spec]));

export function getEurope1953MacroSpec(entityId: WorldEntityId): MacroCountrySeedSpec | undefined {
  return SPEC_BY_ID.get(entityId);
}

export function getEurope1953MacroCountry(
  entityId: WorldEntityId,
  now = new Date()
): MacroCountryState {
  if (entityId === AUSTRIA_ENTITY_ID) return getAustria1953MacroCountry(now);
  const spec = SPEC_BY_ID.get(entityId);
  if (!spec) {
    throw new Error(
      `No authored 1953 macro seed for ${entityId}; refusing modern-preset fallback.`
    );
  }
  return buildMacroCountryFromSpec(spec, now, { markInitialTick: true });
}

export function listEurope1953MacroCountries(now = new Date()): MacroCountryState[] {
  return EUROPE_1953_MACRO_ENTITY_IDS.map((entityId) => getEurope1953MacroCountry(entityId, now));
}
