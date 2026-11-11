import { describe, expect, it } from "vitest";
import { isLegislationTypeActive, isNewThisEra } from "@/lib/era/legislationCatalog";

describe("legislation-types era filter", () => {
  it("drops pre-window types and flags newly-unlocked ones", () => {
    const rows = [
      { _id: "jp_mental_health" }, // from 1970
      { _id: "jp_cybersecurity" }, // from 1998
      { _id: "jp_education_funding" }, // always
    ];
    const year = 1999;
    const gated = rows
      .filter((t) => isLegislationTypeActive(t._id, year))
      .map((t) => ({ ...t, eraNew: isNewThisEra(t._id, year) }));
    expect(gated.map((r) => r._id)).toEqual([
      "jp_mental_health",
      "jp_cybersecurity",
      "jp_education_funding",
    ]);
    expect(gated.find((r) => r._id === "jp_cybersecurity")!.eraNew).toBe(true);
    expect(gated.find((r) => r._id === "jp_mental_health")!.eraNew).toBe(false);
  });

  it("excludes a type still before its window", () => {
    const rows = [{ _id: "jp_cybersecurity" }];
    const gated = rows.filter((t) => isLegislationTypeActive(t._id, 1997));
    expect(gated).toHaveLength(0);
  });
});
