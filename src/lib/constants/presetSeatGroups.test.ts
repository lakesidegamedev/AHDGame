import { describe, expect, it } from "vitest";
import { isBackgroundInPreset, SHIPPING_PRESETS } from "@/lib/world/eraRoster";
import { getPresetFallbacks, resetPresetFallbacks } from "@/lib/seeds/presetSelector";
import {
  BLOC_CHAMBERS_1953,
  BLOC_CHAMBERS_1979,
  BR_CHAMBER_1991,
  BR_EXECUTIVE_1953,
  BR_SENATE_1991,
  CN_GOVERNORS_1991,
  CN_GOVERNORS_2020,
  CN_NPC_1953,
  CN_NPC_1991,
  CN_NPC_2020,
  CN_PEOPLES_CONGRESS_1991,
  CN_PEOPLES_CONGRESS_2020,
  DD_VOLKSKAMMER_1953,
  DD_VOLKSKAMMER_1979,
  DE_BUNDESTAG_1990,
  DE_BUNDESTAG_2021,
  DE_LANDTAG_1990,
  DE_LANDTAG_2020,
  DE_MINISTERPRAESIDENTEN_1992,
  DE_MINISTERPRAESIDENTEN_2020,
  getPresetSeats,
  IE_DAIL_1991,
  IE_DAIL_2020,
  IE_SEANAD_1991,
  IE_SEANAD_2020,
  IE_UACHTARAN_1991,
  IE_UACHTARAN_2019,
  JP_GOVERNORS_1991,
  JP_GOVERNORS_2020,
  JP_REGIONAL_COUNCIL_1991,
  JP_REGIONAL_COUNCIL_2020,
  JP_SANGIIN_1989,
  JP_SANGIIN_2020,
  JP_SHUGIIN_1990,
  JP_SHUGIIN_2020,
  splitCNNPCDelegates,
  SU_SUPREME_SOVIET_1953,
  SU_SUPREME_SOVIET_1979,
  UK_COMMONS_1987,
  UK_COMMONS_2020,
  UK_FIRST_MINISTERS_1992,
  UK_FIRST_MINISTERS_2020,
  UK_REGIONAL_COUNCIL_1992,
  UK_REGIONAL_COUNCIL_2020,
  US_EXECUTIVE_1953,
  US_EXECUTIVE_1992,
  US_EXECUTIVE_2020,
  US_GOVERNOR_1953,
  US_GOVERNORS_1992,
  US_GOVERNORS_2020,
  US_HOUSE_1953,
  US_HOUSE_1992,
  US_HOUSE_2020,
  US_SENATE_1953,
  US_SENATE_1992,
  US_SENATE_2020,
  US_STATE_SENATE_1990,
  US_STATE_SENATE_2020,
} from "./historicalSeats";
import {
  modeledBrMacroregionGovernors,
  modeledIeRegionalOffices,
} from "@/lib/seeds/reference/rules/aggregateRegionalOffices";
import { seatCountFor, seatGroupsFor, seatsForCountry } from "./presetSeatGroups";
import { getCountryConfig, type CountryId } from "./countries";
import { getLowerChamberOfficeType } from "@/lib/legislature/chamberOfficeType";
import { isListTierMethod } from "@/lib/elections/electionMethod";
import { formationChamberSeats } from "@/lib/legislature/rules/liveChamber";

const ALL_PRESETS = [...SHIPPING_PRESETS, "empty", "2019-no-parties", "1968-default"];

// Row counts recomputed from the source arrays themselves, independently of the
// grouping under test. These are the arrays the pre-grouping switch spread.
const SOURCE_2020 =
  US_EXECUTIVE_2020.length +
  US_HOUSE_2020.length +
  US_SENATE_2020.length +
  US_STATE_SENATE_2020.length +
  US_GOVERNORS_2020.length +
  UK_COMMONS_2020.length +
  UK_REGIONAL_COUNCIL_2020.length +
  UK_FIRST_MINISTERS_2020.length +
  JP_SHUGIIN_2020.length +
  JP_SANGIIN_2020.length +
  JP_GOVERNORS_2020.length +
  JP_REGIONAL_COUNCIL_2020.length +
  DE_BUNDESTAG_2021.length +
  DE_LANDTAG_2020.length +
  DE_MINISTERPRAESIDENTEN_2020.length +
  splitCNNPCDelegates(CN_NPC_2020).length +
  splitCNNPCDelegates(CN_PEOPLES_CONGRESS_2020).length +
  CN_GOVERNORS_2020.length +
  IE_DAIL_2020.length +
  IE_SEANAD_2020.length;

const SOURCE_1992 =
  US_EXECUTIVE_1992.length +
  US_HOUSE_1992.length +
  US_SENATE_1992.length +
  US_STATE_SENATE_1990.length +
  US_GOVERNORS_1992.length +
  UK_COMMONS_1987.length +
  UK_REGIONAL_COUNCIL_1992.length +
  UK_FIRST_MINISTERS_1992.length +
  JP_SHUGIIN_1990.length +
  JP_SANGIIN_1989.length +
  JP_GOVERNORS_1991.length +
  JP_REGIONAL_COUNCIL_1991.length +
  DE_BUNDESTAG_1990.length +
  DE_LANDTAG_1990.length +
  DE_MINISTERPRAESIDENTEN_1992.length +
  splitCNNPCDelegates(CN_NPC_1991).length +
  splitCNNPCDelegates(CN_PEOPLES_CONGRESS_1991).length +
  CN_GOVERNORS_1991.length +
  BR_CHAMBER_1991.length +
  BR_SENATE_1991.length +
  modeledBrMacroregionGovernors("1991-default").length +
  IE_DAIL_1991.length +
  IE_SEANAD_1991.length +
  IE_UACHTARAN_1991.length +
  modeledIeRegionalOffices("1991-default").length;

const SOURCE_1953 =
  US_EXECUTIVE_1953.length +
  BR_EXECUTIVE_1953.length +
  US_HOUSE_1953.length +
  US_SENATE_1953.length +
  US_GOVERNOR_1953.length +
  SU_SUPREME_SOVIET_1953.length +
  DD_VOLKSKAMMER_1953.length +
  splitCNNPCDelegates(CN_NPC_1953).length +
  BLOC_CHAMBERS_1953.length;

const SOURCE_1979 =
  SU_SUPREME_SOVIET_1979.length + DD_VOLKSKAMMER_1979.length + BLOC_CHAMBERS_1979.length;

describe("preset seat groups", () => {
  /**
   * Faithful replacement, checked INDEPENDENTLY.
   *
   * `getPresetSeats` now derives from these groups, so comparing the two would
   * be tautological. The pin is instead the raw source arrays: each preset's
   * expected row count is recomputed by summing the very arrays the old switch
   * concatenated, which is arrived at without going through the grouping at all.
   * If a row were dropped, duplicated or misfiled during grouping, these numbers
   * would not agree.
   */
  it("holds exactly the rows the source arrays contain", () => {
    const expected: Record<string, number> = {
      "2019-default":
        SOURCE_2020 +
        IE_UACHTARAN_2019.length +
        modeledBrMacroregionGovernors("2019-default").length +
        modeledIeRegionalOffices("2019-default").length,
      "1999-default": SOURCE_2020,
      "2007-default": SOURCE_2020,
      "2023-default": SOURCE_2020,
      "2019-no-parties": SOURCE_2020,
      "1968-default": SOURCE_2020,
      "1991-default": SOURCE_1992,
      "1953-default": SOURCE_1953,
      "1979-default": SOURCE_1979,
      empty: 0,
    };
    for (const [preset, count] of Object.entries(expected)) {
      expect(Object.values(seatGroupsFor(preset)).flat().length, preset).toBe(count);
      expect(getPresetSeats(preset).length, preset).toBe(count);
    }
  });

  it("assigns every seat to exactly one country", () => {
    for (const preset of ALL_PRESETS) {
      const groups = seatGroupsFor(preset);
      // Background countries (#5702) keep their authored rows here, but the
      // seeding path (`getPresetSeats`) never sees them.
      const total = Object.entries(groups)
        .filter(([countryId]) => !isBackgroundInPreset(preset, countryId))
        .reduce((a, [, rows]) => a + (rows?.length ?? 0), 0);
      expect(total, preset).toBe(getPresetSeats(preset).length);
    }
  });

  it("separates the US and Brazilian senates, which share an officeType", () => {
    // The reason this module exists. Counting `officeType === "senate"` across a
    // 1991 world reports 181, being the US 100 plus Brazil's 81. `state` does
    // not disambiguate either: US and Brazilian region codes share AL, PA, MT,
    // MS, RO, SC, PR and GO, so even (state, officeType) collides on
    // (PA, senate) - Pennsylvania and Para.
    expect(seatCountFor("1991-default", "US", "senate")).toBe(100);
    expect(seatCountFor("1991-default", "US", "house")).toBe(435);
    expect(seatCountFor("1991-default", "BR", "senate")).toBeGreaterThan(0);
  });

  it("splits the multi-country bloc chambers by owning country", () => {
    // BLOC_CHAMBERS_* is one array holding six countries' seats, keyed by a
    // country-prefixed state code (HU_BUD, PL_MAZ) and a matching party prefix.
    for (const id of ["HU", "PL", "RO", "BG", "CS", "YU"] as const) {
      expect(seatCountFor("1953-default", id, "chamber"), id).toBeGreaterThan(0);
    }
  });

  it("reports the measured mismatches for the player countries", () => {
    // Pinned so the data fixes later in Plan C are visible as changes here.
    expect(seatCountFor("1953-default", "US", "senate")).toBe(96);
    // 650, not 651: the 1991 Commons is the one elected in June 1987 on the
    // 1983 boundaries. 651 was the April 1992 chamber, seated into a world that
    // opens fifteen months before it existed. See UK_COMMONS_1987.
    expect(seatCountFor("1991-default", "UK", "commons")).toBe(650);
    expect(seatCountFor("1991-default", "JP", "shugiin")).toBe(512);
    // 252, not 206: the Sangiin used to stop 46 seats short of its own config
    // with nothing declaring the gap. See JP_SANGIIN_1989.
    expect(seatCountFor("1991-default", "JP", "sangiin")).toBe(252);
  });

  it("returns nothing for a country the preset does not seat", () => {
    // 1979 seats only the one-party states; the US and UK start vacant.
    expect(seatsForCountry("1979-default", "US")).toEqual([]);
    expect(seatsForCountry("1979-default", "UK")).toEqual([]);
    expect(seatsForCountry("empty", "US")).toEqual([]);
  });
});

describe("the silent 2020 seat fallback stays recorded", () => {
  /**
   * Regression lock. `getPresetSeats` used to call `recordPresetFallback` from
   * its `default:` branch, and rewriting it to derive from the seat groups
   * dropped that call. The whole suite still passed - nothing covered it - and
   * only an unused-import lint warning gave it away. Without this, a 1999 or
   * 2007 seed run silently stops reporting that its seat lane took another
   * era's data.
   */
  it("records a fallback for presets with no seat groups of their own", () => {
    resetPresetFallbacks();
    getPresetSeats("1999-default");
    getPresetSeats("2007-default");
    expect(getPresetFallbacks().map((f) => f.preset)).toEqual(["1999-default", "2007-default"]);
    expect(getPresetFallbacks()[0].label).toBe("historicalSeats:getPresetSeats");
  });

  it("records nothing for a preset that owns its seats", () => {
    resetPresetFallbacks();
    getPresetSeats("1953-default");
    getPresetSeats("1979-default");
    getPresetSeats("1991-default");
    getPresetSeats("empty");
    expect(getPresetFallbacks()).toEqual([]);
  });

  it("records nothing for the 2019 era itself", () => {
    // recordPresetFallback ignores 2019-era presets: taking 2020 seats in a
    // 2019 world is not a fallback, it is the data.
    resetPresetFallbacks();
    getPresetSeats("2019-default");
    getPresetSeats("2023-default");
    expect(getPresetFallbacks().map((f) => f.preset)).toEqual(["2023-default"]);
  });
});

/**
 * Government formation measures its majority against the lower chamber, so a
 * seated roster that does not sum to that chamber skews every government from
 * turn one (#5688: a 201-seat Bundestag against 630 made every German cabinet
 * a minority). Every preset's lower-chamber roster must match its chamber, or
 * be a known gap pinned here with its reason.
 */
describe("lower-chamber rosters match their chamber", () => {
  const BLOC = ["HU", "PL", "RO", "YU", "BG", "CS"];
  const KNOWN_GAPS: Record<string, Record<string, number>> = {
    // The one-party bloc assemblies seat through the shared bloc chamber
    // rows, and Brazil's 1953 and 2019 chambers start vacant.
    "1953-default": { BR: 0, ...Object.fromEntries(BLOC.map((id) => [id, 0])) },
    "1979-default": Object.fromEntries(BLOC.map((id) => [id, 0])),
    // 1990 Bundestag with overhang; Brazil's 1991 chamber short ten seats.
    "1991-default": { DE: 672, BR: 503 },
    // The US House carries five vacancies awaiting special elections. The
    // 2021 Bundestag roster is a 201-seat scale of the 736-seat result; the
    // formation majority line follows the seated total (see below) until the
    // first election fills the list tier.
    "1999-default": { US: 430, DE: 201 },
    "2007-default": { US: 430, DE: 201 },
    "2019-default": { US: 430, DE: 201, BR: 0 },
    "2023-default": { US: 430, DE: 201 },
  };

  function lowerSeated(preset: string, countryId: CountryId): number {
    const config = getCountryConfig(countryId, preset);
    const keys = new Set([
      getLowerChamberOfficeType(countryId, preset),
      config.legislature.lowerChamber?.key,
    ]);
    return seatsForCountry(preset, countryId)
      .filter((seat) => keys.has(seat.officeType))
      .reduce((sum, seat) => sum + (seat.seatsHeld ?? 1), 0);
  }

  it("every seeded lower chamber sums to its chamber or is a pinned gap", () => {
    for (const preset of SHIPPING_PRESETS) {
      for (const countryId of Object.keys(seatGroupsFor(preset)) as CountryId[]) {
        if (isBackgroundInPreset(preset, countryId)) continue;
        const chamber = getCountryConfig(countryId, preset).legislature.lowerChamber?.seats;
        if (chamber == null) continue;
        const expected = KNOWN_GAPS[preset]?.[countryId] ?? chamber;
        expect(lowerSeated(preset, countryId), `${preset} ${countryId}`).toBe(expected);
      }
    }
  });

  it("the 2027 world has no gaps", () => {
    expect(KNOWN_GAPS["2027-default"]).toBeUndefined();
    expect(lowerSeated("2027-default", "DE")).toBe(630);
  });

  it("a short list-tier roster sets the majority line from its seated total", () => {
    for (const preset of ["1999-default", "2007-default", "2019-default", "2023-default"]) {
      const config = getCountryConfig("DE", preset);
      const listTier = isListTierMethod(config.electionSystems.lowerChamber);
      expect(listTier, preset).toBe(true);
      expect(formationChamberSeats(630, lowerSeated(preset, "DE"), listTier)).toBe(201);
    }
    // A full or overfull chamber, or a single-tier one, keeps its configured size.
    expect(formationChamberSeats(630, 630, true)).toBe(630);
    expect(formationChamberSeats(630, 672, true)).toBe(630);
    expect(formationChamberSeats(435, 430, false)).toBe(435);
    expect(formationChamberSeats(630, 0, true)).toBe(630);
  });
});
