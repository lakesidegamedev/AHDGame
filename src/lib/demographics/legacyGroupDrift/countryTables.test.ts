import { describe, expect, it } from "vitest";
import { createGroupTableResolver } from "./countryTables";
import { US_GROUP_BUCKETS } from "@/lib/countries/us/data/usLegacyGroupBuckets";

describe("createGroupTableResolver", () => {
  const resolve = createGroupTableResolver();

  it("reads a seeded country's own composition table", () => {
    const uk = resolve("UK");
    expect(uk).not.toBe(US_GROUP_BUCKETS);
    expect(uk.post_industrial_workers.slice(0, 2)).toEqual([
      { dim: "education", key: "no_qualifications", w: 0.35 },
      { dim: "income", key: "low", w: 0.3 },
    ]);
  });

  it("gives Scotland and Wales the UK table", () => {
    expect(resolve("SCO")).toBe(resolve("UK"));
    expect(resolve("wal")).toBe(resolve("UK"));
  });

  it("falls back to the US table for the US, a missing country and any unlisted country", () => {
    expect(resolve("US")).toBe(US_GROUP_BUCKETS);
    expect(resolve(undefined)).toBe(US_GROUP_BUCKETS);
    expect(resolve("CA")).toBe(US_GROUP_BUCKETS);
  });

  it("finds a table for every listed country with weights summing to one", () => {
    for (const cc of ["DE", "JP", "IE", "BR", "CN", "RU", "SE", "FR", "IT", "NG", "TR", "PL"]) {
      const table = resolve(cc);
      expect(table, cc).not.toBe(US_GROUP_BUCKETS);
      for (const weights of Object.values(table)) {
        expect(weights.reduce((s, w) => s + w.w, 0)).toBeCloseTo(1, 6);
      }
    }
  });
});
