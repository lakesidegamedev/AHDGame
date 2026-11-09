import { describe, it, expect } from "vitest";
import { describeApprovalEffects } from "./effectAudience";

describe("describing approval effects", () => {
  it("names Layer-1 buckets in the US without raw keys", () => {
    const rows = describeApprovalEffects({ "education:college": 6, "age:senior": -2 }, "US");
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.label).not.toContain("_");
      expect(r.label).not.toContain(":");
    }
  });

  it("sorts by magnitude so the biggest movers read first", () => {
    const rows = describeApprovalEffects({ "education:college": 6, "age:senior": -2 }, "US");
    const mags = rows.map((r) => Math.abs(r.value));
    expect(mags).toEqual([...mags].sort((a, b) => b - a));
  });

  it("drops zero and non-finite effects", () => {
    const rows = describeApprovalEffects(
      { "education:college": 0, "age:senior": NaN as number } as Record<string, number>,
      "US"
    );
    expect(rows).toEqual([]);
  });

  it("ignores keys that are not buckets", () => {
    expect(describeApprovalEffects({ retirees: 4 }, "US")).toEqual([]);
  });

  it("uses the country's own language", () => {
    const de = describeApprovalEffects({ "education:hochschulabschluss": 5 }, "DE");
    expect(de.length).toBeGreaterThan(0);
    expect(de.map((r) => r.label)).toContain("Hochschulabschluss");
  });
});
