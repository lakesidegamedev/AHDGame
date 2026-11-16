import { describe, expect, it } from "vitest";
import { bgRegions2027 } from "@/lib/countries/bg/data/bgRegions2027";
import { brRegions2027 } from "@/lib/countries/br/data/brRegions2027";
import { caRegions2027 } from "@/lib/countries/ca/data/caRegions2027";
import { cnRegions2027 } from "@/lib/countries/cn/data/cnRegions2027";
import { deRegions2027 } from "@/lib/countries/de/data/deRegions2027";
import { huRegions2027 } from "@/lib/countries/hu/data/huRegions2027";
import { jpRegions2027 } from "@/lib/countries/jp/data/jpRegions2027";
import { plRegions2027 } from "@/lib/countries/pl/data/plRegions2027";
import { roRegions2027 } from "@/lib/countries/ro/data/roRegions2027";
import { ukRegions2027 } from "@/lib/countries/uk/data/ukRegions2027";
import { STATE_RESOURCE_CAPACITY } from "./stateResourceCapacity";

// Countries whose 2027 regions use their own ids. A capacity key that names a
// region the seed never creates silently leaves that region with no deposits.
const REGIONS_2027 = {
  BG: bgRegions2027,
  BR: brRegions2027,
  CA: caRegions2027,
  CN: cnRegions2027,
  DE: deRegions2027,
  HU: huRegions2027,
  JP: jpRegions2027,
  PL: plRegions2027,
  RO: roRegions2027,
  UK: ukRegions2027,
} as const;

describe("resource capacity keys match the 2027 regions", () => {
  for (const [countryId, regions] of Object.entries(REGIONS_2027)) {
    it(`${countryId}: every capacity entry names a seeded region, and some region has deposits`, () => {
      const ids = new Set(regions.map((region) => String(region._id)));
      const keys = Object.keys(STATE_RESOURCE_CAPACITY).filter((key) =>
        key.startsWith(`${countryId}:`)
      );
      const unknown = keys.filter((key) => !ids.has(key.slice(countryId.length + 1)));
      expect(unknown, `capacity keys with no 2027 region in ${countryId}`).toEqual([]);
      const withDeposits = keys.filter(
        (key) => Object.keys(STATE_RESOURCE_CAPACITY[key]!.resources).length > 0
      );
      expect(withDeposits.length, `${countryId} has no region with deposits`).toBeGreaterThan(0);
    });
  }
});
