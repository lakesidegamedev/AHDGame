import { describe, expect, it } from "vitest";
import { metricCategories } from "@/lib/constants/metricDefinitions";
import { DOMAIN_BUCKET_AFFINITIES } from "@/lib/bucketAffinities";
import { COUNTRY_BUCKET_LABELS } from "@/lib/demographics/bucketLabelsByCountry";
import { caRegionCensusData2027 } from "./caRegionCensusData2027";
import { caRegions2027 } from "./caRegions2027";
import { CA_AUTHORED_METRIC_PATHS, caMetricPresets2027 } from "./caMetricPresets2027";

function caBucketKeys(): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(caRegionCensusData2027.CA_ON).map(([dim, buckets]) => [
      dim,
      Object.keys(buckets).sort(),
    ])
  );
}

function missingAffinities(entries: Record<string, number>): string[] {
  return Object.entries(caBucketKeys()).flatMap(([dim, keys]) =>
    keys.filter((key) => !(`${dim}:${key}` in entries)).map((key) => `${dim}:${key}`)
  );
}

const regionIds = caRegions2027.map((region) => String(region._id));

describe("Canada 2027 census bundle", () => {
  it("covers every province and territory", () => {
    expect(Object.keys(caRegionCensusData2027).sort()).toEqual([...regionIds].sort());
  });

  it("sums every dimension to 100 in every region", () => {
    for (const [id, census] of Object.entries(caRegionCensusData2027)) {
      for (const [dim, buckets] of Object.entries(census)) {
        const total = Object.values(buckets as Record<string, number>).reduce((a, b) => a + b, 0);
        expect(total, `${id}.${dim}`).toBe(100);
      }
    }
  });

  it("uses the same bucket keys in every region", () => {
    const keys = caBucketKeys();
    for (const census of Object.values(caRegionCensusData2027)) {
      for (const [dim, buckets] of Object.entries(census)) {
        expect(Object.keys(buckets as object).sort()).toEqual(keys[dim]);
      }
    }
  });

  it("puts Quebec's francophone majority and Nunavut's Indigenous majority in the data", () => {
    expect(caRegionCensusData2027.CA_QC.ethnicity.francophone).toBeGreaterThan(70);
    expect(caRegionCensusData2027.CA_NU.ethnicity.indigenous).toBeGreaterThan(80);
    expect(caRegionCensusData2027.CA_NB.ethnicity.francophone).toBeGreaterThan(25);
  });
});

describe("Canada bucket labels and affinities", () => {
  it("labels every bucket in the census", () => {
    const labels = COUNTRY_BUCKET_LABELS.CA;
    for (const [dim, keys] of Object.entries(caBucketKeys())) {
      expect(labels.dims[dim], dim).toBeTruthy();
      for (const key of keys) expect(labels.buckets[dim][key], `${dim}:${key}`).toBeTruthy();
    }
  });

  it("gives every domain an affinity for every bucket", () => {
    const table = DOMAIN_BUCKET_AFFINITIES.CA;
    expect(Object.keys(table).length).toBeGreaterThan(10);
    for (const [domain, entries] of Object.entries(table)) {
      expect(missingAffinities(entries), domain).toEqual([]);
    }
  });
});

describe("Canada 2027 metric preset", () => {
  it("authors every path in every region, within the metric bounds", () => {
    for (const id of regionIds) {
      const preset = caMetricPresets2027[id];
      expect(preset, id).toBeTruthy();
      for (const path of CA_AUTHORED_METRIC_PATHS) {
        const [cat, metric] = path.split(".");
        const def = metricCategories
          .find((c) => c.id === cat)
          ?.metrics.find((m) => m.id === metric);
        const value = preset[path];
        expect(typeof value, `${id}.${path}`).toBe("number");
        expect(value, `${id}.${path} min`).toBeGreaterThanOrEqual(def?.minValue ?? 0);
        expect(value, `${id}.${path} max`).toBeLessThanOrEqual(def?.maxValue ?? 100);
      }
    }
  });
});
