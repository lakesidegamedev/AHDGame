/**
 * Era-aware readiness expectations.
 *
 * `COUNTRY_READINESS_EXPECTATIONS` is authored per country with no era
 * awareness, so fields that have a genuine per-era source are derived here.
 * The rest stay authored because they are not counts (`seatMin` is a
 * deliberate floor, and `HistoricalSeat` has no `countryId` to filter by).
 * Every derived field falls back to the authored value when no era source
 * exists.
 *
 * Lives here, reading from `regionBundles` rather than
 * `seedDiagnostic/expectations`, to avoid an import cycle.
 */
import type { CountryId } from "@/lib/constants/countries";
import {
  COUNTRY_READINESS_EXPECTATIONS,
  type CountryReadinessExpectations,
} from "@/lib/constants/countryReadinessExpectations";
import { expectedRegionCount, regionBundleFor } from "@/lib/admin/seedDiagnostic/regionBundles";
import { partyRosterLabel, partySeedsForPreset } from "@/lib/seeds/partySeedRegistry";
import { checkGovernmentFormation } from "@/lib/constants/readinessChecks";

/**
 * Era overrides for `seatMin`, where a country's chambers are a different size
 * than the authored entry assumes.
 *
 * Override rather than derive: `seatMin` is a judgment about what a healthy
 * fresh world looks like, not a chamber-size sum.
 *
 * Japan's 1991 Diet is 512 + 252 = 764 seats; the authored 713 (modern Diet)
 * would pass a world missing a fifth of its upper house. The US floor of 535
 * and the UK's 650 hold in both eras.
 */
const SEAT_MIN_BY_PRESET: Partial<
  Record<string, Partial<Record<CountryId, { seatMin: number; seatNote: string }>>>
> = {
  "1991-default": {
    JP: {
      seatMin: 764,
      seatNote: "Expected ≥764 (512 Shugiin + 252 Sangiin, pre-1994 Diet)",
    },
  },
};

const INITIAL_READINESS_BY_PRESET: Partial<
  Record<string, Partial<Record<CountryId, Partial<CountryReadinessExpectations>>>>
> = {
  "1991-default": {
    RU: {
      // The leader-confidence document is part of the Soviet one-party
      // premier system. January 1991 Russia has a multiparty successor
      // roster; it still needs a formed government, but its missing Soviet
      // leader-confidence row is not a defect in that government.
      extras: [(db) => checkGovernmentFormation("RU", db)],
      // The 70-person floor describes the USSR's two-chamber delegation and
      // premier roster. January 1991 RSFSR uses a different Congress; no
      // founding NPP/official seeder currently populates those rows, as with
      // the other six 1991 successor countries. Count its organization and
      // government documents separately instead of testing Soviet offices.
      nppMin: 0,
      nppNote: "No Soviet delegation roster in the 1991 RSFSR seed",
      officialMin: 0,
    },
    DE: {
      // The reunified 1991 roster seeds 70 party footprints across 16 Länder:
      // CDU/CSU are geographically exclusive and PDS/Alliance 90 are not
      // represented in every Land. The 112-row floor describes a later roster.
      statePartyOrgMin: 70,
      // Founding NPPs are seated before later candidate generation. The
      // modern 217-person estimate counts offices, not distinct people.
      nppMin: 177,
      nppNote: "Expected ≥177 founding German NPPs before candidate generation",
    },
  },
  "2027-default": {
    DE: {
      // Six national party footprints plus Bavaria-only CSU: 15 CDU + 1 CSU
      // + five parties in all 16 Länder = 96 organizations.
      statePartyOrgMin: 96,
      // Fresh bootstrap seats multiple offices per NPP. Additional candidates
      // are generated during turns, so the old 217 unique-person floor was wrong.
      nppMin: 177,
      nppNote: "Expected ≥177 founding German NPPs before candidate generation",
    },
  },
};

/**
 * What this country should look like in this preset, or null when no entry is
 * authored for it at all.
 */
export function getReadinessExpectations(
  countryId: CountryId,
  preset: string
): CountryReadinessExpectations | null {
  const authored = COUNTRY_READINESS_EXPECTATIONS[countryId];
  if (!authored) return null;

  // null when the country has no era-authored region bundle: keep the number the
  // entry already carries rather than collapsing the expectation to zero.
  const regions = expectedRegionCount(countryId, preset);
  const parties = partySeedsForPreset(countryId, preset);
  const seats = SEAT_MIN_BY_PRESET[preset]?.[countryId];
  const eraOverride = INITIAL_READINESS_BY_PRESET[preset]?.[countryId];
  // January 1991 seeds the whole Soviet Union: ten Russian economic regions
  // plus fourteen republics, each with its own demographics and macro vector.
  // The older Soviet bundles deliberately omit three demographic/metric rows.
  const fullSovietCoverage = countryId === "RU" && preset === "1991-default";
  const sovietRegions = fullSovietCoverage ? regionBundleFor(countryId, preset) : null;

  return {
    ...authored,
    ...(eraOverride ?? {}),
    ...(seats ?? {}),
    regionCount: regions ?? authored.regionCount,
    // Both track the region count, and both are era-varying for the same reason.
    // Where an entry deliberately differs (RU: 17 regions but 14 demographic
    // rows, the Soviet republics being checked under their own entries), the
    // difference is carried through as an offset rather than flattened.
    demographicsCount:
      eraOverride?.demographicsCount ??
      (regions === null
        ? authored.demographicsCount
        : regions - (fullSovietCoverage ? 0 : authored.regionCount - authored.demographicsCount)),
    stateMetricsCount:
      eraOverride?.stateMetricsCount ??
      (regions === null
        ? authored.stateMetricsCount
        : regions - (fullSovietCoverage ? 0 : authored.regionCount - authored.stateMetricsCount)),
    // Union republic vectors use SU_* identities, while the legacy filter
    // names only Russian regions and older aggregate rows. Match the roster
    // that supplies the expected count and exclude national summaries.
    stateMetricsFilter: sovietRegions
      ? { countryId, _id: { $in: sovietRegions.map((region) => region._id) } }
      : authored.stateMetricsFilter,
    // `Math.min` keeps the authored floor as a ceiling on itself: when an era
    // seeds fewer parties than the entry demands, the expectation drops to what
    // the era actually seeds, and it never invents a stricter requirement than
    // the author wrote. An era that seeds none expects none.
    partyMin: Math.min(authored.partyMin, parties.length),
    partyRoster: partyRosterLabel(parties),
  };
}
