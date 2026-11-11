/**
 * Monetary coverage determines which countries have tradable currencies and banks.
 * getPresetMonetaryScope follows the scenario's fiscal books and excludes absent
 * countries or duplicate shared-currency banks.
 */
import type { CountryId } from "@/lib/constants/countries";
import { COUNTRY_ORDER } from "@/lib/constants/countriesCore";
import { FOREX_ACTIVE_COUNTRIES } from "@/lib/constants/currencies";
import { isRegisteredTier, tierFor } from "@/lib/world/eraRoster";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";

export type MonetaryCoverageExclusionReason =
  "absent-in-era" | "fiscal-model-unauthored" | "shared-currency-bank";

export interface MonetaryCoverageExclusion {
  countryId: CountryId;
  reason: MonetaryCoverageExclusionReason;
  detail: string;
}

export interface PresetMonetaryScope {
  /** Tradable currencies for this preset; 1991 excludes issuers absent in that era. */
  forexCountries: readonly CountryId[];
  /** Countries with both an active currency and an authored national fiscal model. */
  centralBankCountries: CountryId[];
  /** Country monetary models deliberately excluded from the current preset. */
  exclusions: MonetaryCoverageExclusion[];
}

const COLD_WAR_FISCAL_PRESETS = new Set(["1953-default", "1979-default"]);

/**
 * 2027 countries that trade a currency but have no authored 2027 national
 * budget. Their regional GDP is authored in PLN and RON at 2024 rates, so the
 * currencies need exchange rows; a central bank waits for a fiscal book.
 */
const UNBUDGETED_2027: readonly CountryId[] = ["PL", "RO"];

/**
 * Every country the 2027 roster registers (player, npp or background), in the
 * legacy forex order first so existing rows keep their position. Absent
 * countries (DD after reunification, the Soviet republics) get no row.
 */
function rosterForexCountries2027(): CountryId[] {
  const ordered = [
    ...FOREX_ACTIVE_COUNTRIES,
    ...COUNTRY_ORDER.filter((countryId) => !FOREX_ACTIVE_COUNTRIES.includes(countryId)),
  ];
  return ordered.filter((countryId) => isRegisteredTier(tierFor("2027-default", countryId)));
}

const POST_COLD_WAR_EXCLUSIONS: readonly MonetaryCoverageExclusion[] = [
  {
    countryId: "RU",
    reason: "fiscal-model-unauthored",
    detail: "RU has currency support but no authored post-Soviet national fiscal model",
  },
  {
    countryId: "DD",
    reason: "absent-in-era",
    detail: "DD is absent after German reunification",
  },
];

/**
 * Resolve the explicit monetary coverage contract instead of assuming that
 * every tradable currency represents a fully modelled sovereign economy. The
 * preset-matrix test cross-checks this lightweight runtime manifest against the
 * authored national-budget configs.
 */
export function getPresetMonetaryScope(preset: string): PresetMonetaryScope {
  // The five 2019 transition fiscal books now exist, including RU. Their
  // modern currencies each need a seeded FX row and central bank.
  const exclusions = COLD_WAR_FISCAL_PRESETS.has(preset)
    ? []
    : POST_COLD_WAR_EXCLUSIONS.filter(
        (entry) =>
          !["1991-default", "2019-default"].includes(preset) ||
          !countryHasFeature("ruLib", entry.countryId)
      );
  // The 2027 Bulgarian fiscal row is EUR. Its exchange-rate row remains
  // country-addressable, while DE's existing EUR bank represents the shared
  // policy rate. Creating a second BG bank would double-count the ECB.
  if (preset === "2027-default") {
    exclusions.push({
      countryId: "BG",
      reason: "shared-currency-bank",
      detail: "BG uses EUR and the existing DE-anchored ECB in 2027",
    });
    for (const countryId of UNBUDGETED_2027) {
      exclusions.push({
        countryId,
        reason: "fiscal-model-unauthored",
        detail: `${countryId} has a 2027 currency but no authored 2027 national fiscal model`,
      });
    }
  }
  const excluded = new Set(exclusions.map(({ countryId }) => countryId));
  const candidateForexCountries =
    preset === "1991-default"
      ? ([...FOREX_ACTIVE_COUNTRIES, "PL", "HU", "RO", "BG", "CS", "YU"] as CountryId[])
      : preset === "2019-default"
        ? ([...FOREX_ACTIVE_COUNTRIES, "PL", "HU", "RO", "BG"] as CountryId[])
        : preset === "2027-default"
          ? rosterForexCountries2027()
          : FOREX_ACTIVE_COUNTRIES;
  const absentInEra = new Set(
    exclusions.filter((entry) => entry.reason === "absent-in-era").map((entry) => entry.countryId)
  );
  const forexCountries =
    preset === "1991-default" || preset === "2027-default"
      ? candidateForexCountries.filter((countryId) => !absentInEra.has(countryId))
      : candidateForexCountries;
  const centralBankCountries = forexCountries.filter((countryId) => !excluded.has(countryId));

  return {
    forexCountries,
    centralBankCountries,
    exclusions,
  };
}
