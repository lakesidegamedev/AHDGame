import { describe, expect, it } from "vitest";
import { isLegislationTypeActive, isNewThisEra } from "@/lib/era/legislationCatalog";

describe("legislation-types era filter", () => {
  it("drops pre-window types and flags newly-unlocked ones", () => {
    const rows = [
      { _id: "ie_mental_health" }, // from 1970
      { _id: "ie_cybersecurity" }, // from 1998
      { _id: "ie_agricultural_subsidies" }, // always
    ];
    const year = 1999;
    const gated = rows
      .filter((t) => isLegislationTypeActive(t._id, year))
      .map((t) => ({ ...t, eraNew: isNewThisEra(t._id, year) }));
    expect(gated.map((r) => r._id)).toEqual([
      "ie_mental_health",
      "ie_cybersecurity",
      "ie_agricultural_subsidies",
    ]);
    expect(gated.find((r) => r._id === "ie_cybersecurity")!.eraNew).toBe(true);
    expect(gated.find((r) => r._id === "ie_mental_health")!.eraNew).toBe(false);
  });

  it("excludes a type still before its window", () => {
    const rows = [{ _id: "ie_cybersecurity" }];
    const gated = rows.filter((t) => isLegislationTypeActive(t._id, 1997));
    expect(gated).toHaveLength(0);
  });
});
