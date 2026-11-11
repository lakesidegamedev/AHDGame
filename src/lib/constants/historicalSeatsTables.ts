/**
 * Historical seat data for February 2020 (game starting point).
 * Used to populate NPPs on game reset.
 *
 * US: 116th Congress (2019-2021) as of February 2020
 * UK: Post-December 2019 general election
 *
 * DATA STRUCTURE:
 * For multi-seat offices like House/Commons, each entry represents ONE NPP
 * who holds the `seatsHeld` count of seats for their party in that state.
 * Example: California has { party: "democrat", seatsHeld: 45 } meaning
 * ONE Democrat NPP holds all 45 Democratic House seats from CA.
 */

import type { CountryId } from "./countries";
import type { HistoricalSeat } from "@/lib/seats/historicalSeat";
import { BR_EXECUTIVE_1953 } from "@/lib/countries/br/data/historicalSeats1953";
import { BR_CHAMBER_1991, BR_SENATE_1991 } from "@/lib/countries/br/data/historicalSeats1991";
import { CN_NPC_1953 } from "@/lib/countries/cn/data/historicalSeats1953";
import {
  CN_NPC_1991,
  CN_PEOPLES_CONGRESS_1991,
  CN_GOVERNORS_1991,
} from "@/lib/countries/cn/data/historicalSeats1991";
import {
  CN_NPC_2020,
  CN_GOVERNORS_2020,
  CN_PEOPLES_CONGRESS_2020,
} from "@/lib/countries/cn/data/historicalSeats2020";
import { DD_VOLKSKAMMER_1953 } from "@/lib/countries/dd/data/historicalSeats1953";
import { DD_VOLKSKAMMER_1979 } from "@/lib/countries/dd/data/historicalSeats1979";
import { DE_BUNDESTAG_1990, DE_LANDTAG_1990 } from "@/lib/countries/de/data/historicalSeats1990";
import { DE_MINISTERPRAESIDENTEN_1992 } from "@/lib/countries/de/data/historicalSeats1992";
import {
  DE_MINISTERPRAESIDENTEN_2020,
  DE_LANDTAG_2020,
} from "@/lib/countries/de/data/historicalSeats2020";
import { DE_BUNDESTAG_2021 } from "@/lib/countries/de/data/historicalSeats2021";
import {
  IE_DAIL_1991,
  IE_SEANAD_1991,
  IE_UACHTARAN_1991,
} from "@/lib/countries/ie/data/historicalSeats1991";
import { IE_UACHTARAN_2019 } from "@/lib/countries/ie/data/historicalSeats2019";
import { IE_DAIL_2020, IE_SEANAD_2020 } from "@/lib/countries/ie/data/historicalSeats2020";
import { JP_SANGIIN_1989 } from "@/lib/countries/jp/data/historicalSeats1989";
import { JP_SHUGIIN_1990 } from "@/lib/countries/jp/data/historicalSeats1990";
import {
  JP_REGIONAL_COUNCIL_1991,
  JP_GOVERNORS_1991,
} from "@/lib/countries/jp/data/historicalSeats1991";
import {
  JP_SHUGIIN_2020,
  JP_SANGIIN_2020,
  JP_GOVERNORS_2020,
  JP_REGIONAL_COUNCIL_2020,
} from "@/lib/countries/jp/data/historicalSeats2020";
import { NG_GOVERNORS_1953 } from "@/lib/countries/ng/data/historicalSeats1953";
import { NG_GOVERNORS_1991 } from "@/lib/countries/ng/data/historicalSeats1991";
import { NG_GOVERNORS_2019 } from "@/lib/countries/ng/data/historicalSeats2019";
import { SU_SUPREME_SOVIET_1953 } from "@/lib/countries/ru/data/historicalSeats1953";
import { SU_SUPREME_SOVIET_1979 } from "@/lib/countries/ru/data/historicalSeats1979";
import { UK_COMMONS_1987 } from "@/lib/countries/uk/data/historicalSeats1987";
import {
  UK_FIRST_MINISTERS_1992,
  UK_REGIONAL_COUNCIL_1992,
} from "@/lib/countries/uk/data/historicalSeats1992";
import {
  UK_COMMONS_2020,
  UK_REGIONAL_COUNCIL_2020,
  UK_FIRST_MINISTERS_2020,
} from "@/lib/countries/uk/data/historicalSeats2020";
import {
  US_EXECUTIVE_1953,
  US_HOUSE_1953,
  US_SENATE_1953,
  US_GOVERNOR_1953,
} from "@/lib/countries/us/data/historicalSeats1953";
import { US_STATE_SENATE_1990 } from "@/lib/countries/us/data/historicalSeats1990";
import {
  US_HOUSE_1992,
  US_SENATE_1992,
  US_GOVERNORS_1992,
  US_EXECUTIVE_1992,
} from "@/lib/countries/us/data/historicalSeats1992";
import {
  US_HOUSE_2020,
  US_SENATE_2020,
  US_GOVERNORS_2020,
  US_STATE_SENATE_2020,
  US_EXECUTIVE_2020,
} from "@/lib/countries/us/data/historicalSeats2020";
import { US_EXECUTIVE_2027 } from "@/lib/countries/us/data/historicalSeats2027";
import { CA_COMMONS_2027 } from "@/lib/countries/ca/data/caCommons2027";

export type { HistoricalSeat };
export {
  BR_EXECUTIVE_1953,
  BR_CHAMBER_1991,
  BR_SENATE_1991,
  CN_NPC_1953,
  CN_NPC_1991,
  CN_PEOPLES_CONGRESS_1991,
  CN_GOVERNORS_1991,
  CN_NPC_2020,
  CN_GOVERNORS_2020,
  CN_PEOPLES_CONGRESS_2020,
  DD_VOLKSKAMMER_1953,
  DD_VOLKSKAMMER_1979,
  DE_BUNDESTAG_1990,
  DE_LANDTAG_1990,
  DE_MINISTERPRAESIDENTEN_1992,
  DE_MINISTERPRAESIDENTEN_2020,
  DE_LANDTAG_2020,
  DE_BUNDESTAG_2021,
  IE_DAIL_1991,
  IE_SEANAD_1991,
  IE_UACHTARAN_1991,
  IE_UACHTARAN_2019,
  IE_DAIL_2020,
  IE_SEANAD_2020,
  JP_SANGIIN_1989,
  JP_SHUGIIN_1990,
  JP_REGIONAL_COUNCIL_1991,
  JP_GOVERNORS_1991,
  JP_SHUGIIN_2020,
  JP_SANGIIN_2020,
  JP_GOVERNORS_2020,
  JP_REGIONAL_COUNCIL_2020,
  NG_GOVERNORS_1953,
  NG_GOVERNORS_1991,
  NG_GOVERNORS_2019,
  SU_SUPREME_SOVIET_1953,
  SU_SUPREME_SOVIET_1979,
  UK_COMMONS_1987,
  UK_FIRST_MINISTERS_1992,
  UK_REGIONAL_COUNCIL_1992,
  UK_COMMONS_2020,
  UK_REGIONAL_COUNCIL_2020,
  UK_FIRST_MINISTERS_2020,
  US_EXECUTIVE_1953,
  US_HOUSE_1953,
  US_SENATE_1953,
  US_GOVERNOR_1953,
  US_STATE_SENATE_1990,
  US_HOUSE_1992,
  US_SENATE_1992,
  US_GOVERNORS_1992,
  US_EXECUTIVE_1992,
  US_HOUSE_2020,
  US_SENATE_2020,
  US_GOVERNORS_2020,
  US_STATE_SENATE_2020,
  US_EXECUTIVE_2020,
  US_EXECUTIVE_2027,
};

import { tierFor, type ShippingPreset } from "@/lib/world/eraRoster";
import { COUNTRY_ORDER } from "./countries";
import {
  US_HOUSE_2027_RESULT,
  US_SENATE_2027_RESULT,
} from "@/lib/countries/us/data/usCongressResult2027";
import {
  US_GOVERNORS_2027,
  US_STATE_SENATE_2027,
} from "@/lib/countries/us/data/usStateOffices2027";
import {
  DE_BUNDESTAG_2027,
  JP_SANGIIN_2027,
  JP_SHUGIIN_2027,
  UK_COMMONS_2027,
} from "@/lib/seeds/reference/worldSeats2027";
import {
  modeledBrMacroregionGovernors,
  modeledIeRegionalOffices,
} from "@/lib/seeds/reference/rules/aggregateRegionalOffices";

// CN NPC delegate + Provincial People's Congress split — see splitCNNPCDelegates below
export const CN_CCP_NPPS_PER_REGION = 7;

/** Office types in CN that get the 7-NPPs-per-region CCP split. */
const CN_SPLITTABLE_OFFICE_TYPES = new Set(["npcDelegate", "peoplesCongress"]);

/**
 * Split CCP delegate rows into `CN_CCP_NPPS_PER_REGION` (7) NPPs per
 * region, distributing the historical seat count evenly. Applies to
 * both `npcDelegate` (national) and `peoplesCongress` (sub-national
 * Provincial People's Congress) rows. CDL / CNDCA rows are passed
 * through unchanged — one NPP per region per minor party, holding all
 * of that party's seats in the region.
 *
 * Rationale (2026-05-23): the raw historical data has one row = one NPP
 * holding all seats for a party in a region. For CCP the HD (Huadong) NPC row
 * alone is one NPP carrying 874 seats — a single character can't
 * realistically represent the whole regional caucus. 7 CCP NPPs per
 * region gives enough density for caucus dynamics (retirements,
 * scandals, factional play) without spawning thousands of identical
 * characters at seed.
 *
 * Total seatsHeld per (region, party) is preserved exactly. Rows with
 * `seatsHeld` undefined or zero are passed through unchanged (the splitter
 * only fires when there are seats to distribute).
 */
export function splitCNNPCDelegates(rows: HistoricalSeat[]): HistoricalSeat[] {
  const out: HistoricalSeat[] = [];
  for (const row of rows) {
    const isCcpDelegate = row.party === "cn_ccp" && CN_SPLITTABLE_OFFICE_TYPES.has(row.officeType);
    if (!isCcpDelegate) {
      out.push(row);
      continue;
    }
    const total = row.seatsHeld ?? 0;
    if (total <= 0) {
      out.push(row);
      continue;
    }
    const n = CN_CCP_NPPS_PER_REGION;
    const base = Math.floor(total / n);
    const remainder = total % n;
    for (let i = 0; i < n; i++) {
      const held = base + (i < remainder ? 1 : 0);
      if (held <= 0) continue;
      out.push({ ...row, seatsHeld: held });
    }
  }
  return out;
}

// ─── Reset Presets ───────────────────────────────────────────────────────────
// Presets define starting conditions for game resets

export interface ResetPreset {
  id: string;
  name: string;
  description: string;
  /** Countries included in this preset */
  countries: CountryId[];
  /** If true, delete all default parties (Democrat, Republican, UK parties) */
  deleteDefaultParties?: boolean;
}

/**
 * Countries a preset actually contains, straight from the era roster.
 *
 * This list is declarative — nothing reads it to drive seeding — but it is the
 * admin-facing manifest of what a reset produces, served verbatim by
 * `/api/admin/reset/presets`. Hand-maintained, it drifted: 1991-default listed
 * seven countries while the world it produced had sixteen. Deriving it means the
 * picker cannot disagree with the reset any more.
 *
 * Latent countries (UKR/BLR/BAL, SCO/WAL) are excluded by construction: they are
 * outside `COUNTRY_ORDER`, so a preset never advertises a country it will not
 * register.
 */
function presetCountries(preset: ShippingPreset): CountryId[] {
  return COUNTRY_ORDER.filter((id) => tierFor(preset, id) !== "absent");
}

// Other Eastern-Bloc one-party states 1953 — same party/region structure as 1979.
// Byelorussia and the Baltics are NOT here either: they are separate playable
// countries (BLR/BAL) with their own chambers, not part of the bloc-satellite
// pattern this list encodes.
export const BLOC_CHAMBERS_1953: HistoricalSeat[] = [
  { state: "HU_BUD", officeType: "chamber", party: "hu_mdp", seatsHeld: 52 },
  { state: "HU_PES", officeType: "chamber", party: "hu_mdp", seatsHeld: 27 },
  { state: "HU_TRW", officeType: "chamber", party: "hu_mdp", seatsHeld: 58 },
  { state: "HU_TRS", officeType: "chamber", party: "hu_mdp", seatsHeld: 30 },
  { state: "HU_NOR", officeType: "chamber", party: "hu_mdp", seatsHeld: 39 },
  { state: "HU_ALF", officeType: "chamber", party: "hu_mdp", seatsHeld: 92 },
  { state: "PL_MAZ", officeType: "chamber", party: "pl_pzpr", seatsHeld: 60 },
  { state: "PL_LOD", officeType: "chamber", party: "pl_pzpr", seatsHeld: 50 },
  { state: "PL_MAL", officeType: "chamber", party: "pl_pzpr", seatsHeld: 60 },
  { state: "PL_SLK", officeType: "chamber", party: "pl_pzpr", seatsHeld: 65 },
  { state: "PL_DSL", officeType: "chamber", party: "pl_pzpr", seatsHeld: 42 },
  { state: "PL_WLK", officeType: "chamber", party: "pl_pzpr", seatsHeld: 62 },
  { state: "PL_POM", officeType: "chamber", party: "pl_pzpr", seatsHeld: 46 },
  { state: "PL_EAS", officeType: "chamber", party: "pl_pzpr", seatsHeld: 40 },
  { state: "RO_BUC", officeType: "chamber", party: "ro_pmr", seatsHeld: 28 },
  { state: "RO_MUN", officeType: "chamber", party: "ro_pmr", seatsHeld: 80 },
  { state: "RO_OLT", officeType: "chamber", party: "ro_pmr", seatsHeld: 41 },
  { state: "RO_TRA", officeType: "chamber", party: "ro_pmr", seatsHeld: 75 },
  { state: "RO_VST", officeType: "chamber", party: "ro_pmr", seatsHeld: 52 },
  { state: "RO_MOL", officeType: "chamber", party: "ro_pmr", seatsHeld: 68 },
  { state: "RO_DOB", officeType: "chamber", party: "ro_pmr", seatsHeld: 14 },
  { state: "YU_SLO", officeType: "chamber", party: "yu_skj", seatsHeld: 25 },
  { state: "YU_CRO", officeType: "chamber", party: "yu_skj", seatsHeld: 61 },
  { state: "YU_BIH", officeType: "chamber", party: "yu_skj", seatsHeld: 55 },
  { state: "YU_SRB", officeType: "chamber", party: "yu_skj", seatsHeld: 77 },
  { state: "YU_VOJ", officeType: "chamber", party: "yu_skj", seatsHeld: 27 },
  { state: "YU_KOS", officeType: "chamber", party: "yu_skj", seatsHeld: 20 },
  { state: "YU_MNE", officeType: "chamber", party: "yu_skj", seatsHeld: 8 },
  { state: "YU_MKD", officeType: "chamber", party: "yu_skj", seatsHeld: 25 },
  { state: "BG_SOF", officeType: "chamber", party: "bg_bkp", seatsHeld: 50 },
  { state: "BG_NOR", officeType: "chamber", party: "bg_bkp", seatsHeld: 137 },
  { state: "BG_COA", officeType: "chamber", party: "bg_bkp", seatsHeld: 53 },
  { state: "BG_THR", officeType: "chamber", party: "bg_bkp", seatsHeld: 113 },
  { state: "BG_SW", officeType: "chamber", party: "bg_bkp", seatsHeld: 31 },
  { state: "CS_PRG", officeType: "chamber", party: "cs_ksc", seatsHeld: 15 },
  { state: "CS_BOH", officeType: "chamber", party: "cs_ksc", seatsHeld: 75 },
  { state: "CS_MOR", officeType: "chamber", party: "cs_ksc", seatsHeld: 53 },
  { state: "CS_SVK", officeType: "chamber", party: "cs_ksc", seatsHeld: 57 },
];

// Other Warsaw-Pact one-party states — single National Front list, ruling party holds the chamber.
// Byelorussia and the Baltics are NOT here either: they are separate playable
// countries (BLR/BAL) with their own chambers, not part of the bloc-satellite
// pattern this list encodes.
export const BLOC_CHAMBERS_1979: HistoricalSeat[] = [
  { state: "HU_BUD", officeType: "chamber", party: "hu_mszmp", seatsHeld: 68 },
  { state: "HU_PES", officeType: "chamber", party: "hu_mszmp", seatsHeld: 32 },
  { state: "HU_TRW", officeType: "chamber", party: "hu_mszmp", seatsHeld: 71 },
  { state: "HU_TRS", officeType: "chamber", party: "hu_mszmp", seatsHeld: 35 },
  { state: "HU_NOR", officeType: "chamber", party: "hu_mszmp", seatsHeld: 46 },
  { state: "HU_ALF", officeType: "chamber", party: "hu_mszmp", seatsHeld: 100 },
  { state: "PL_MAZ", officeType: "chamber", party: "pl_pzpr", seatsHeld: 63 },
  { state: "PL_LOD", officeType: "chamber", party: "pl_pzpr", seatsHeld: 49 },
  { state: "PL_MAL", officeType: "chamber", party: "pl_pzpr", seatsHeld: 63 },
  { state: "PL_SLK", officeType: "chamber", party: "pl_pzpr", seatsHeld: 71 },
  { state: "PL_DSL", officeType: "chamber", party: "pl_pzpr", seatsHeld: 48 },
  { state: "PL_WLK", officeType: "chamber", party: "pl_pzpr", seatsHeld: 66 },
  { state: "PL_POM", officeType: "chamber", party: "pl_pzpr", seatsHeld: 57 },
  { state: "PL_EAS", officeType: "chamber", party: "pl_pzpr", seatsHeld: 43 },
  { state: "RO_BUC", officeType: "chamber", party: "ro_pcr", seatsHeld: 35 },
  { state: "RO_MUN", officeType: "chamber", party: "ro_pcr", seatsHeld: 78 },
  { state: "RO_OLT", officeType: "chamber", party: "ro_pcr", seatsHeld: 40 },
  { state: "RO_TRA", officeType: "chamber", party: "ro_pcr", seatsHeld: 77 },
  { state: "RO_VST", officeType: "chamber", party: "ro_pcr", seatsHeld: 50 },
  { state: "RO_MOL", officeType: "chamber", party: "ro_pcr", seatsHeld: 74 },
  { state: "RO_DOB", officeType: "chamber", party: "ro_pcr", seatsHeld: 15 },
  { state: "YU_SLO", officeType: "chamber", party: "yu_skj", seatsHeld: 26 },
  { state: "YU_CRO", officeType: "chamber", party: "yu_skj", seatsHeld: 63 },
  { state: "YU_BIH", officeType: "chamber", party: "yu_skj", seatsHeld: 57 },
  { state: "YU_SRB", officeType: "chamber", party: "yu_skj", seatsHeld: 79 },
  { state: "YU_VOJ", officeType: "chamber", party: "yu_skj", seatsHeld: 28 },
  { state: "YU_KOS", officeType: "chamber", party: "yu_skj", seatsHeld: 21 },
  { state: "YU_MNE", officeType: "chamber", party: "yu_skj", seatsHeld: 8 },
  { state: "YU_MKD", officeType: "chamber", party: "yu_skj", seatsHeld: 26 },
  { state: "BG_SOF", officeType: "chamber", party: "bg_bkp", seatsHeld: 58 },
  { state: "BG_NOR", officeType: "chamber", party: "bg_bkp", seatsHeld: 130 },
  { state: "BG_COA", officeType: "chamber", party: "bg_bkp", seatsHeld: 58 },
  { state: "BG_THR", officeType: "chamber", party: "bg_bkp", seatsHeld: 118 },
  { state: "BG_SW", officeType: "chamber", party: "bg_bkp", seatsHeld: 36 },
  { state: "CS_PRG", officeType: "chamber", party: "cs_ksc", seatsHeld: 16 },
  { state: "CS_BOH", officeType: "chamber", party: "cs_ksc", seatsHeld: 68 },
  { state: "CS_MOR", officeType: "chamber", party: "cs_ksc", seatsHeld: 51 },
  { state: "CS_SVK", officeType: "chamber", party: "cs_ksc", seatsHeld: 65 },
];

export const RESET_PRESETS: ResetPreset[] = [
  {
    id: "1953-default",
    name: "1953 Start Date - Early Cold War",
    description:
      "The Early Cold War world: US/UK and the USSR are player-enabled (Stalin died March 1953; Khrushchev consolidating). France/Italy/Spain/Sweden/Turkey + Japan/China/West Germany(FRG)/Brazil/Ireland are economy-enabled. East Germany (June 17 uprising 1953!) and the Stalinist bloc (Poland/Romania/Yugoslavia/Hungary/Czechoslovakia/Bulgaria) are NPP-run one-party states; Byelorussia and the Baltics are Soviet union republics inside the USSR, not separate states. Nigeria is a British colony (coming-soon). Real ~1953 demographics, metrics and budgets per country. One-party legislatures start seated; democracies start vacant.",
    countries: presetCountries("1953-default"),
  },
  {
    id: "2027-default",
    name: "2027 Start Date - Five-Country Modern World",
    description:
      "January 2027 with playable United States, United Kingdom, Japan, Germany, and China. Seats the US Congress, governors and state senates from the November 2026 election results and uses the latest completed national elections elsewhere.",
    // Derived like every other preset. Upstream hard-coded the five PLAYER
    // countries here, but this list is what the admin reset picker offers and
    // what /api/admin/reset/presets returns, so it has to name every country the
    // reset actually produces -- players, economy-preview and NPP-run alike.
    // `eraContract.test.ts` S6 is what catches the two disagreeing.
    countries: presetCountries("2027-default"),
  },
  {
    id: "2023-default",
    name: "2023 Start Date - Default Parties",
    description:
      "US 118th Congress (Jan 2023, post-2022 midterms) — Democratic presidency, divided government (Republican House / Democratic Senate). Real 2023 Census/BEA/BLS state data + FY2023 budget. Non-US countries fall back to their 2019 bundles.",
    countries: presetCountries("2023-default"),
  },
  {
    id: "2019-default",
    name: "2019 Start Date - Default Parties",
    description:
      "US 116th Congress (Feb 2020) + UK post-2019 election + JP National Diet (Jan 2020) + DE 19th Bundestag scaled + 2019 Ministerpräsidenten + CN 13th NPC + IE 33rd Dáil (2020).",
    countries: presetCountries("2019-default"),
  },
  {
    id: "1991-default",
    name: "1991 Start Date - Default Parties",
    description:
      "US 102nd Congress (1991-93) + UK post-1992 election + JP post-1990 election + DE 12th Bundestag + CN 7th NPC + BR 49th Congress + IE 27th Dáil. Reg/Org seeded from 1988-92 election baselines.",
    countries: presetCountries("1991-default"),
  },
  {
    id: "1979-default",
    name: "1979 Start Date - Cold War",
    description:
      "The Cold War world: US/UK and the USSR are player-enabled; France/Italy/Spain/Sweden/Turkey + China/Japan/Germany(FRG)/Brazil/Nigeria are economy-enabled; East Germany and the Warsaw-Pact bloc (Poland/Romania/Yugoslavia/Hungary/Czechoslovakia/Bulgaria) are NPP-run one-party states; Byelorussia and the Baltics are Soviet union republics inside the USSR, not separate states. Real ~1979 demographics, metrics and budgets per country. Legislatures start vacant (historical seat maps are a follow-up).",
    countries: presetCountries("1979-default"),
  },
  {
    id: "empty",
    name: "2019 Start Date - No NPPs",
    description: "Start with no seated officials. All seats vacant for player elections.",
    countries: [],
  },
  {
    id: "2019-no-parties",
    name: "2019 Start Date - No Parties",
    description: "No NPPs, no default parties. Clean slate for player-created parties.",
    countries: [],
    deleteDefaultParties: true,
  },
];

/**
 * Get seats for a specific preset
 */
/**
 * Preset seats, grouped by the country that owns them.
 *
 * `HistoricalSeat` carries no `countryId`, and `officeType` is NOT unique to a
 * country: `senate` is both the US Senate and the Brazilian Senate, so counting
 * a 1991 world by office type alone reports 181 US senators. `state` does not
 * disambiguate either - US and Brazilian region codes share AL, PA, MT, MS, RO,
 * SC, PR and GO - and neither does the pair, since `(PA, senate)` is both
 * Pennsylvania and Para.
 *
 * The owning country is therefore recorded here, where the source arrays are
 * still separate, rather than inferred after concatenation where the
 * information has already been thrown away. `getPresetSeats` flattens this, so
 * there is one source and not two.
 *
 * The USSR maps to `RU`, matching how the roster and the `su` policy prefix
 * already model it.
 */
export type SeatGroups = Partial<Record<CountryId, HistoricalSeat[]>>;

/** Split a multi-country array by the country prefix on each row's party id. */
function byPartyPrefix(rows: HistoricalSeat[], prefixes: Record<string, CountryId>): SeatGroups {
  const out: SeatGroups = {};
  for (const row of rows) {
    const prefix = row.party.split("_")[0];
    const countryId = prefixes[prefix];
    if (!countryId) {
      // Loud rather than silently misattributed: a row landing in the wrong
      // country is exactly the failure this grouping exists to prevent.
      throw new Error(`No country for bloc seat party "${row.party}" (state ${row.state}).`);
    }
    (out[countryId] ??= []).push(row);
  }
  return out;
}

const BLOC_PREFIXES: Record<string, CountryId> = {
  hu: "HU",
  pl: "PL",
  ro: "RO",
  bg: "BG",
  cs: "CS",
  yu: "YU",
};

/** Merge groups, concatenating per country. */
function mergeGroups(...parts: SeatGroups[]): SeatGroups {
  const out: SeatGroups = {};
  for (const part of parts) {
    for (const [id, rows] of Object.entries(part) as [CountryId, HistoricalSeat[]][]) {
      (out[id] ??= []).push(...rows);
    }
  }
  return out;
}

export const SEAT_GROUPS_2020: SeatGroups = {
  US: [
    ...US_EXECUTIVE_2020,
    ...US_HOUSE_2020,
    ...US_SENATE_2020,
    ...US_STATE_SENATE_2020,
    ...US_GOVERNORS_2020,
  ],
  UK: [...UK_COMMONS_2020, ...UK_REGIONAL_COUNCIL_2020, ...UK_FIRST_MINISTERS_2020],
  JP: [...JP_SHUGIIN_2020, ...JP_SANGIIN_2020, ...JP_GOVERNORS_2020, ...JP_REGIONAL_COUNCIL_2020],
  DE: [...DE_BUNDESTAG_2021, ...DE_LANDTAG_2020, ...DE_MINISTERPRAESIDENTEN_2020],
  CN: [
    ...splitCNNPCDelegates(CN_NPC_2020),
    ...splitCNNPCDelegates(CN_PEOPLES_CONGRESS_2020),
    ...CN_GOVERNORS_2020,
  ],
  IE: [...IE_DAIL_2020, ...IE_SEANAD_2020],
};

// The older 1999/2007 presets also fall back to SEAT_GROUPS_2020. Keep the
// source-backed 2019 incumbent out of those earlier opening-state rosters.
// Michael D. Higgins began his second presidential term on 11 Nov 2018.
// https://president.ie/en/the-president/michaeldhiggins/
export const SEAT_GROUPS_2019: SeatGroups = mergeGroups(SEAT_GROUPS_2020, {
  BR: modeledBrMacroregionGovernors("2019-default"),
  IE: [...IE_UACHTARAN_2019, ...modeledIeRegionalOffices("2019-default")],
});

/**
 * The 2027 preset in the country-owned grouping.
 *
 * Major-country rosters keep their arrays; BR and IE add only the modeled
 * aggregate regional offices. The US executive is the January 2027 ticket with
 * fixed fictional identities (a presidential player country with no president
 * is a broken world). US Congress, governors and state senates come from the
 * November 2026 results (`usCongressResult2027.ts`, `usStateOffices2027.ts`).
 */
export const SEAT_GROUPS_2027: SeatGroups = {
  US: [
    ...US_EXECUTIVE_2027,
    ...US_HOUSE_2027_RESULT,
    ...US_SENATE_2027_RESULT,
    ...US_STATE_SENATE_2027,
    ...US_GOVERNORS_2027,
  ],
  UK: [...UK_COMMONS_2027, ...UK_REGIONAL_COUNCIL_2020, ...UK_FIRST_MINISTERS_2020],
  JP: [...JP_SHUGIIN_2027, ...JP_SANGIIN_2027, ...JP_GOVERNORS_2020, ...JP_REGIONAL_COUNCIL_2020],
  DE: [...DE_BUNDESTAG_2027, ...DE_LANDTAG_2020, ...DE_MINISTERPRAESIDENTEN_2020],
  CN: [
    ...splitCNNPCDelegates(CN_NPC_2020),
    ...splitCNNPCDelegates(CN_PEOPLES_CONGRESS_2020),
    ...CN_GOVERNORS_2020,
  ],
  BR: modeledBrMacroregionGovernors("2027-default"),
  IE: modeledIeRegionalOffices("2027-default"),
  // Canada seats its Commons only once the roster includes it.
  ...(tierFor("2027-default", "CA") === "absent" ? {} : { CA: CA_COMMONS_2027 }),
};

export const SEAT_GROUPS_1992: SeatGroups = {
  US: [
    ...US_EXECUTIVE_1992,
    ...US_HOUSE_1992,
    ...US_SENATE_1992,
    ...US_STATE_SENATE_1990,
    ...US_GOVERNORS_1992,
  ],
  UK: [...UK_COMMONS_1987, ...UK_REGIONAL_COUNCIL_1992, ...UK_FIRST_MINISTERS_1992],
  JP: [...JP_SHUGIIN_1990, ...JP_SANGIIN_1989, ...JP_GOVERNORS_1991, ...JP_REGIONAL_COUNCIL_1991],
  DE: [...DE_BUNDESTAG_1990, ...DE_LANDTAG_1990, ...DE_MINISTERPRAESIDENTEN_1992],
  CN: [
    ...splitCNNPCDelegates(CN_NPC_1991),
    ...splitCNNPCDelegates(CN_PEOPLES_CONGRESS_1991),
    ...CN_GOVERNORS_1991,
  ],
  BR: [...BR_CHAMBER_1991, ...BR_SENATE_1991, ...modeledBrMacroregionGovernors("1991-default")],
  // Mary Robinson was inaugurated on 3 Dec 1990 and held office at opening.
  // https://www.president.ie/en/the-president/mary-robinson
  IE: [
    ...IE_DAIL_1991,
    ...IE_SEANAD_1991,
    ...IE_UACHTARAN_1991,
    ...modeledIeRegionalOffices("1991-default"),
  ],
};

export const SEAT_GROUPS_1953: SeatGroups = mergeGroups(
  {
    US: [...US_EXECUTIVE_1953, ...US_HOUSE_1953, ...US_SENATE_1953, ...US_GOVERNOR_1953],
    BR: [...BR_EXECUTIVE_1953],
    RU: [...SU_SUPREME_SOVIET_1953],
    DD: [...DD_VOLKSKAMMER_1953],
    CN: [...splitCNNPCDelegates(CN_NPC_1953)],
  },
  byPartyPrefix(BLOC_CHAMBERS_1953, BLOC_PREFIXES)
);

export const SEAT_GROUPS_1979: SeatGroups = mergeGroups(
  {
    RU: [...SU_SUPREME_SOVIET_1979],
    DD: [...DD_VOLKSKAMMER_1979],
  },
  byPartyPrefix(BLOC_CHAMBERS_1979, BLOC_PREFIXES)
);
