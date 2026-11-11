import { getCountryLayer1Model } from "@/lib/seeds/international";
import type { EraId } from "@/lib/seeds/presetSelector";
import { US_GROUP_BUCKETS } from "@/lib/countries/us/data/usLegacyGroupBuckets";
import type { GroupBucketTable, GroupBucketWeight } from "./rules";

/**
 * Countries whose voter groups the older builds projected through their own
 * seeded composition table. Any other country fell back to the US table, and
 * the conversion has to reproduce that read exactly.
 */
const SEEDED_TABLE_COUNTRIES = new Set([
  "UK",
  "DE",
  "JP",
  "IE",
  "BR",
  "CN",
  "RU",
  "SE",
  "FR",
  "IT",
  "AT",
  "DD",
  "ES",
  "FI",
  "GR",
  "NG",
  "TR",
  "HU",
  "PL",
  "RO",
  "YU",
  "BG",
  "BLR",
  "UKR",
  "CS",
  "BAL",
]);

/** Scotland and Wales share the UK's voter groups. */
const ALIASES: Readonly<Record<string, string>> = { SCO: "UK", WAL: "UK" };

/** Composition is era-stable, so the first era a country is seeded for gives the table. */
const PROBE_ERAS = ["2019", "modern", "1979", "1953"] as EraId[];

function seededTable(countryId: string): GroupBucketTable | null {
  for (const era of PROBE_ERAS) {
    let model;
    try {
      model = getCountryLayer1Model(countryId, era);
    } catch {
      continue;
    }
    const table: Record<string, GroupBucketWeight[]> = {};
    for (const [groupId, entry] of Object.entries(model?.composition ?? {})) {
      if (entry?.weights?.length) {
        table[groupId] = entry.weights.map(({ dim, key, w }) => ({ dim, key, w }));
      }
    }
    if (Object.keys(table).length > 0) return table;
  }
  return null;
}

/** Builds and caches the group to bucket table the older builds used for each country. */
export function createGroupTableResolver(): (countryId: string | undefined) => GroupBucketTable {
  const cache = new Map<string, GroupBucketTable>();
  return (countryId) => {
    const upper = (countryId ?? "US").toUpperCase();
    const source = ALIASES[upper] ?? upper;
    const hit = cache.get(source);
    if (hit) return hit;
    const table =
      (SEEDED_TABLE_COUNTRIES.has(source) ? seededTable(source) : null) ?? US_GROUP_BUCKETS;
    cache.set(source, table);
    return table;
  };
}
