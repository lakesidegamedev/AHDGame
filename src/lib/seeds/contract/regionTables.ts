/**
 * The region roster each country seeds, per preset. One table per country, read
 * by its region seeder through `selectPresetBundle` and by the seed contract,
 * so the contract checks exactly what a reset writes.
 *
 * A preset absent from a table has no authored roster for that country: seeding
 * it throws `SeedContractError`. Two presets that genuinely share a roster point
 * at the same array and are flagged by the duplicate guard unless the dataset
 * is declared era-invariant.
 *
 * Server-only: imports every era's region data as values.
 */

import type { State } from "@/lib/db/types";
import { SEED_PRESET_IDS, type SeedPresetId } from "@/lib/constants/turnTime";
import { atRegions } from "@/lib/seeds/at/atRegions";
import { atRegions1953 } from "@/lib/seeds/at/atRegions1953";
import { atRegions1991 } from "@/lib/countries/at/data/atRegions1991";
import { AT_GEOGRAPHY } from "@/lib/countries/at/geography";
import { brRegions } from "@/lib/seeds/br/brRegions";
import { brRegions1953 } from "@/lib/seeds/br/brRegions1953";
import { brRegions1979 } from "@/lib/seeds/br/brRegions1979";
import { brRegions1991 } from "@/lib/seeds/br/brRegions1991";
import { brRegions1999 } from "@/lib/seeds/br/brRegions1999";
import { brRegions2007 } from "@/lib/seeds/br/brRegions2007";
import { brRegions2023 } from "@/lib/seeds/br/brRegions2023";
import { brRegions2027 } from "@/lib/countries/br/data/brRegions2027";
import { cnRegions } from "@/lib/seeds/cn/cnRegions";
import { cnRegions1953 } from "@/lib/seeds/cn/cnRegions1953";
import { cnRegions1979 } from "@/lib/seeds/cn/cnRegions1979";
import { cnRegions1991 } from "@/lib/seeds/cn/cnRegions1991";
import { cnRegions1999 } from "@/lib/seeds/cn/cnRegions1999";
import { cnRegions2007 } from "@/lib/seeds/cn/cnRegions2007";
import { cnRegions2023 } from "@/lib/seeds/cn/cnRegions2023";
import { cnRegions2027 } from "@/lib/seeds/cn/cnRegions2027";
import { ddRegions } from "@/lib/seeds/dd/ddRegions";
import { ddRegions1953 } from "@/lib/seeds/dd/ddRegions1953";
import { deRegions } from "@/lib/seeds/de/deRegions";
import { deRegions1953 } from "@/lib/seeds/de/deRegions1953";
import { deRegions1979 } from "@/lib/seeds/de/deRegions1979";
import { deRegions1991 } from "@/lib/seeds/de/deRegions1991";
import { deRegions1999 } from "@/lib/seeds/de/deRegions1999";
import { deRegions2007 } from "@/lib/seeds/de/deRegions2007";
import { deRegions2023 } from "@/lib/seeds/de/deRegions2023";
import { deRegions2027 } from "@/lib/seeds/de/deRegions2027";
import { esRegions } from "@/lib/seeds/es/esRegions";
import { esRegions1953 } from "@/lib/seeds/es/esRegions1953";
import { esRegions1991 } from "@/lib/countries/es/data/esRegions1991";
import { ES_GEOGRAPHY } from "@/lib/countries/es/geography";
import { fiRegions } from "@/lib/seeds/fi/fiRegions";
import { fiRegions1953 } from "@/lib/seeds/fi/fiRegions1953";
import { fiRegions1991 } from "@/lib/countries/fi/data/fiRegions1991";
import { FI_GEOGRAPHY } from "@/lib/countries/fi/geography";
import { frRegions } from "@/lib/seeds/fr/frRegions";
import { frRegions1953 } from "@/lib/seeds/fr/frRegions1953";
import { frRegions1991 } from "@/lib/countries/fr/data/frRegions1991";
import { FR_GEOGRAPHY } from "@/lib/countries/fr/geography";
import { grRegions } from "@/lib/seeds/gr/grRegions";
import { grRegions1953 } from "@/lib/seeds/gr/grRegions1953";
import { grRegions1991 } from "@/lib/countries/gr/data/grRegions1991";
import { GR_GEOGRAPHY } from "@/lib/countries/gr/geography";
import { huRegions2027 } from "@/lib/countries/hu/data/huRegions2027";
import { ieRegions } from "@/lib/seeds/ie/ieRegions";
import { ieRegions1953 } from "@/lib/seeds/ie/ieRegions1953";
import { ieRegions1979 } from "@/lib/seeds/ie/ieRegions1979";
import { ieRegions1991 } from "@/lib/seeds/ie/ieRegions1991";
import { ieRegions1999 } from "@/lib/seeds/ie/ieRegions1999";
import { ieRegions2007 } from "@/lib/seeds/ie/ieRegions2007";
import { ieRegions2023 } from "@/lib/seeds/ie/ieRegions2023";
import { IE_GEOGRAPHY } from "@/lib/countries/ie/geography";
import { itRegions } from "@/lib/seeds/it/itRegions";
import { itRegions1953 } from "@/lib/seeds/it/itRegions1953";
import { itRegions1991 } from "@/lib/countries/it/data/itRegions1991";
import { IT_GEOGRAPHY } from "@/lib/countries/it/geography";
import { jpRegions } from "@/lib/countries/jp/data/jpRegions";
import { jpRegions1953 } from "@/lib/countries/jp/data/jpRegions1953";
import { jpRegions1979 } from "@/lib/countries/jp/data/jpRegions1979";
import { jpRegions1991 } from "@/lib/countries/jp/data/jpRegions1991";
import { jpRegions1999 } from "@/lib/countries/jp/data/jpRegions1999";
import { jpRegions2007 } from "@/lib/countries/jp/data/jpRegions2007";
import { jpRegions2023 } from "@/lib/countries/jp/data/jpRegions2023";
import { jpRegions2027 } from "@/lib/countries/jp/data/jpRegions2027";
import { ngRegions } from "@/lib/seeds/ng/ngRegions";
import { ngRegions1953 } from "@/lib/seeds/ng/ngRegions1953";
import { ngRegions1979 } from "@/lib/seeds/ng/ngRegions1979";
import { ngRegions1991 } from "@/lib/seeds/ng/ngRegions1991";
import { ngRegions1999 } from "@/lib/seeds/ng/ngRegions1999";
import { ngRegions2007 } from "@/lib/seeds/ng/ngRegions2007";
import { ngRegions2023 } from "@/lib/seeds/ng/ngRegions2023";
import { NG_GEOGRAPHY } from "@/lib/countries/ng/geography";
import { ruRegions } from "@/lib/seeds/ru/ruRegions";
import { ruRegions1953 } from "@/lib/seeds/ru/ruRegions1953";
import { ruRegions2027 } from "@/lib/countries/ru/data/ruRegions2027";
import { plRegions2027 } from "@/lib/countries/pl/data/plRegions2027";
import { roRegions2027 } from "@/lib/countries/ro/data/roRegions2027";
import { bgRegions2027 } from "@/lib/countries/bg/data/bgRegions2027";
import { seRegions } from "@/lib/seeds/se/seRegions";
import { seRegions1953 } from "@/lib/seeds/se/seRegions1953";
import { seRegions1991 } from "@/lib/countries/se/data/seRegions1991";
import { SE_GEOGRAPHY } from "@/lib/countries/se/geography";
import { trRegions } from "@/lib/seeds/tr/trRegions";
import { trRegions1953 } from "@/lib/seeds/tr/trRegions1953";
import { trRegions1991 } from "@/lib/countries/tr/data/trRegions1991";
import { trRegions2013 } from "@/lib/countries/tr/data/trRegions2013";
import { trRegionsModern } from "@/lib/countries/tr/data/trRegionsModern";
import { TR_GEOGRAPHY } from "@/lib/countries/tr/geography";
import { ukRegions } from "@/lib/seeds/uk/ukRegions";
import { ukRegions1953 } from "@/lib/seeds/uk/ukRegions1953";
import { ukRegions1979 } from "@/lib/seeds/uk/ukRegions1979";
import { ukRegions1991 } from "@/lib/seeds/uk/ukRegions1991";
import { ukRegions1999 } from "@/lib/seeds/uk/ukRegions1999";
import { ukRegions2007 } from "@/lib/seeds/uk/ukRegions2007";
import { ukRegions2023 } from "@/lib/seeds/uk/ukRegions2023";
import { ukRegions2027 } from "@/lib/seeds/uk/ukRegions2027";
import { US_STATES_BY_PRESET } from "@/lib/admin/seed/seedStates";

export type RegionTable = Partial<Record<SeedPresetId, State[]>>;

const ALL_PRESETS: readonly SeedPresetId[] = SEED_PRESET_IDS;
const COLD_WAR_PRESETS: readonly SeedPresetId[] = ["1953-default", "1979-default"];
const MODERN_2027: readonly SeedPresetId[] = ["2027-default"];

/** Germany is divided only in the Cold War presets; later presets have no GDR. */
const NO_GDR: RegionTable = Object.fromEntries(
  ALL_PRESETS.filter((preset) => !COLD_WAR_PRESETS.includes(preset)).map((preset) => [preset, []])
);

export interface CountryRegionTable {
  /** Presets in which this country's region seeder runs. */
  readonly seededIn: readonly SeedPresetId[];
  readonly table: RegionTable;
}

export const REGION_TABLES: Readonly<Record<string, CountryRegionTable>> = {
  US: { seededIn: ALL_PRESETS, table: US_STATES_BY_PRESET },
  UK: {
    seededIn: ALL_PRESETS,
    table: {
      "1953-default": ukRegions1953,
      "1979-default": ukRegions1979,
      "1991-default": ukRegions1991,
      "1999-default": ukRegions1999,
      "2007-default": ukRegions2007,
      "2019-default": ukRegions,
      "2023-default": ukRegions2023,
      "2027-default": ukRegions2027,
    },
  },
  JP: {
    seededIn: ALL_PRESETS,
    table: {
      "1953-default": jpRegions1953,
      "1979-default": jpRegions1979,
      "1991-default": jpRegions1991,
      "1999-default": jpRegions1999,
      "2007-default": jpRegions2007,
      "2019-default": jpRegions,
      "2023-default": jpRegions2023,
      "2027-default": jpRegions2027,
    },
  },
  DE: {
    seededIn: ALL_PRESETS,
    table: {
      "1953-default": deRegions1953,
      "1979-default": deRegions1979,
      "1991-default": deRegions1991,
      "1999-default": deRegions1999,
      "2007-default": deRegions2007,
      "2019-default": deRegions,
      "2023-default": deRegions2023,
      "2027-default": deRegions2027,
    },
  },
  DD: {
    seededIn: ALL_PRESETS,
    table: { ...NO_GDR, "1953-default": ddRegions1953, "1979-default": ddRegions },
  },
  CN: {
    seededIn: ALL_PRESETS,
    table: {
      "1953-default": cnRegions1953,
      "1979-default": cnRegions1979,
      "1991-default": cnRegions1991,
      "1999-default": cnRegions1999,
      "2007-default": cnRegions2007,
      "2019-default": cnRegions,
      "2023-default": cnRegions2023,
      "2027-default": cnRegions2027,
    },
  },
  BR: {
    seededIn: ALL_PRESETS,
    table: {
      "1953-default": brRegions1953,
      "1979-default": brRegions1979,
      "1991-default": brRegions1991,
      "1999-default": brRegions1999,
      "2007-default": brRegions2007,
      "2019-default": brRegions,
      "2023-default": brRegions2023,
      "2027-default": brRegions2027,
    },
  },
  NG: {
    seededIn: ALL_PRESETS,
    table: {
      "1953-default": ngRegions1953,
      "1979-default": ngRegions1979,
      "1991-default": ngRegions1991,
      "1999-default": ngRegions1999,
      "2007-default": ngRegions2007,
      "2019-default": ngRegions,
      "2023-default": ngRegions2023,
      "2027-default": NG_GEOGRAPHY.regionBundles["2027-default"],
    },
  },
  IE: {
    seededIn: ALL_PRESETS,
    table: {
      "1953-default": ieRegions1953,
      "1979-default": ieRegions1979,
      "1991-default": ieRegions1991,
      "1999-default": ieRegions1999,
      "2007-default": ieRegions2007,
      "2019-default": ieRegions,
      "2023-default": ieRegions2023,
      "2027-default": IE_GEOGRAPHY.regionBundles["2027-default"],
    },
  },
  FR: {
    seededIn: ALL_PRESETS,
    table: {
      "1953-default": frRegions1953,
      "1979-default": frRegions,
      "1991-default": frRegions1991,
      "2019-default": frRegions,
      "2027-default": FR_GEOGRAPHY.regionBundles["2027-default"],
    },
  },
  IT: {
    seededIn: ALL_PRESETS,
    table: {
      "1953-default": itRegions1953,
      "1979-default": itRegions,
      "1991-default": itRegions1991,
      "2019-default": itRegions,
      "2027-default": IT_GEOGRAPHY.regionBundles["2027-default"],
    },
  },
  ES: {
    seededIn: ALL_PRESETS,
    table: {
      "1953-default": esRegions1953,
      "1979-default": esRegions,
      "1991-default": esRegions1991,
      "2019-default": esRegions,
      "2027-default": ES_GEOGRAPHY.regionBundles["2027-default"],
    },
  },
  SE: {
    seededIn: ALL_PRESETS,
    table: {
      "1953-default": seRegions1953,
      "1979-default": seRegions,
      "1991-default": seRegions1991,
      "2019-default": seRegions,
      "2027-default": SE_GEOGRAPHY.regionBundles["2027-default"],
    },
  },
  TR: {
    seededIn: ALL_PRESETS,
    table: {
      "1953-default": trRegions1953,
      "1979-default": trRegions,
      "1991-default": trRegions1991,
      "1999-default": trRegions2013,
      "2007-default": trRegions2013,
      "2019-default": trRegionsModern,
      "2023-default": trRegionsModern,
      "2027-default": TR_GEOGRAPHY.regionBundles["2027-default"],
    },
  },
  GR: {
    seededIn: ALL_PRESETS,
    table: {
      "1953-default": grRegions1953,
      "1979-default": grRegions,
      "1991-default": grRegions1991,
      "2019-default": grRegions,
      "2027-default": GR_GEOGRAPHY.regionBundles["2027-default"],
    },
  },
  AT: {
    seededIn: ALL_PRESETS,
    table: {
      "1953-default": atRegions1953,
      "1979-default": atRegions,
      "1991-default": atRegions1991,
      "2019-default": atRegions,
      "2027-default": AT_GEOGRAPHY.regionBundles["2027-default"],
    },
  },
  FI: {
    seededIn: ALL_PRESETS,
    table: {
      "1953-default": fiRegions1953,
      "1979-default": fiRegions,
      "1991-default": fiRegions1991,
      "2019-default": fiRegions,
      "2027-default": FI_GEOGRAPHY.regionBundles["2027-default"],
    },
  },
  HU: {
    seededIn: MODERN_2027,
    table: { "2027-default": huRegions2027 },
  },
  RU: {
    seededIn: [...COLD_WAR_PRESETS, ...MODERN_2027],
    table: {
      "1953-default": ruRegions1953,
      "1979-default": ruRegions,
      "2027-default": ruRegions2027,
    },
  },
  PL: { seededIn: MODERN_2027, table: { "2027-default": plRegions2027 } },
  RO: { seededIn: MODERN_2027, table: { "2027-default": roRegions2027 } },
  BG: { seededIn: MODERN_2027, table: { "2027-default": bgRegions2027 } },
};

/** The per-preset region table registered for `countryId`. */
export function regionTableFor(countryId: string): RegionTable {
  const entry = REGION_TABLES[countryId];
  if (!entry) throw new Error(`No region table registered for ${countryId}`);
  return entry.table;
}
