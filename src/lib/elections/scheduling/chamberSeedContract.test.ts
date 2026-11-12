/**
 * Seed contract for chamber specs: a spec whose seats come from region data must
 * find a seat value on every region each era preset seeds. A gap fails here, in
 * authored data, instead of throwing inside a live turn.
 */
import {
  BETA_SENATE_SPECS,
  AT_LOWER_CHAMBER_SPEC,
  ES_LOWER_CHAMBER_SPEC,
  FI_LOWER_CHAMBER_SPEC,
  FR_LOWER_CHAMBER_SPEC,
  GR_LOWER_CHAMBER_SPEC,
  IT_LOWER_CHAMBER_SPEC,
  SE_LOWER_CHAMBER_SPEC,
  TR_LOWER_CHAMBER_SPEC,
} from "./countries/betaParliamentSpecs";
import { describe, expect, it } from "vitest";
import { NATIONAL_SCOPE_IDS } from "@/lib/constants/nationalScope";
import { SEED_PRESET_IDS } from "@/lib/constants/turnTime";
import { REGION_TABLES } from "@/lib/seeds/contract/regionTables";
import { seatsForRegion, type ChamberSpec } from "./chamberSpec";
import { IE_CHAMBER_SPECS } from "@/lib/countries/ie/elections/chamberSpecs";
import { NG_CHAMBER_SPECS } from "@/lib/countries/ng/elections/chamberSpecs";
import { CN_CHAMBER_SPECS } from "@/lib/countries/cn/elections/chamberSpecs";
import { BR_CHAMBER_SPECS } from "@/lib/countries/br/elections/chamberSpecs";
import { DE_CHAMBER_SPECS } from "@/lib/countries/de/elections/chamberSpecs";
import { JP_CHAMBER_SPECS } from "@/lib/countries/jp/elections/chamberSpecs";
import { dataPresetFor } from "@/lib/seeds/presetSelector";

const SPECS: readonly ChamberSpec[] = [
  ...IE_CHAMBER_SPECS,
  ...NG_CHAMBER_SPECS,
  ...CN_CHAMBER_SPECS,
  ...BR_CHAMBER_SPECS,
  ...DE_CHAMBER_SPECS,
  ...JP_CHAMBER_SPECS,
  ...BETA_SENATE_SPECS,
  FR_LOWER_CHAMBER_SPEC,
  IT_LOWER_CHAMBER_SPEC,
  ES_LOWER_CHAMBER_SPEC,
  SE_LOWER_CHAMBER_SPEC,
  TR_LOWER_CHAMBER_SPEC,
  GR_LOWER_CHAMBER_SPEC,
  AT_LOWER_CHAMBER_SPEC,
  FI_LOWER_CHAMBER_SPEC,
];

function seededRegions(spec: ChamberSpec, preset: (typeof SEED_PRESET_IDS)[number]) {
  const entry = REGION_TABLES[spec.countryId];
  if (!entry?.seededIn.includes(preset)) return [];
  const seeded = entry.table[dataPresetFor(preset) as typeof preset] ?? [];
  return seeded.filter(
    (r) => r.countryId === spec.countryId && !NATIONAL_SCOPE_IDS.has(String(r._id))
  );
}

const checkedRegions = (spec: ChamberSpec, preset: (typeof SEED_PRESET_IDS)[number]): number =>
  seededRegions(spec, preset).length;

function gapsFor(spec: ChamberSpec, preset: (typeof SEED_PRESET_IDS)[number]): string[] {
  const regions = seededRegions(spec, preset);
  const gaps: string[] = [];
  for (const region of regions) {
    try {
      for (const chamberClass of spec.classes ? ([1, 2] as const) : [undefined]) {
        seatsForRegion(spec, String(region._id), region, preset, chamberClass);
      }
      const ctx = { startingYear: Number.parseInt(preset, 10), preset };
      if (spec.regionAnchor && spec.regionAnchor(String(region._id), preset, ctx) === undefined) {
        throw new Error(`no cycle anchor for ${String(region._id)}`);
      }
    } catch (error) {
      gaps.push(`${preset} ${spec.countryId}/${spec.chamberId}: ${(error as Error).message}`);
    }
  }
  return gaps;
}

describe("chamber specs against seeded region data", () => {
  it.each(SPECS.map((spec) => [`${spec.countryId}/${spec.chamberId}`, spec] as const))(
    "%s has a seat value for every region in every era preset",
    (_name, spec) => {
      const gaps = SEED_PRESET_IDS.flatMap((preset) => gapsFor(spec, preset));
      expect(gaps).toEqual([]);
      expect(SEED_PRESET_IDS.some((preset) => checkedRegions(spec, preset) > 0)).toBe(true);
    }
  );
});
