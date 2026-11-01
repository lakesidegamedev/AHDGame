import { describe, it, expect } from "vitest";
import { getSubdivisionMode } from "./subdivisionConfig";

describe("subdivision registry", () => {
  it("resolves all three RU election types to seatConsistent with District labels", () => {
    for (const t of ["supremeSovietDeputy", "nationalitiesDeputy", "republicSupremeSoviet"]) {
      const m = getSubdivisionMode("RU", t);
      expect(m?.mode).toBe("seatConsistent");
      expect(m?.config.dataDir).toBe("subdivisions/ru");
      expect(m?.config.unitLabel).toBe("District");
      expect(m?.config.unitLabelPlural).toBe("Districts");
    }
  });

  it("UK keeps Constituency labels", () => {
    const m = getSubdivisionMode("UK", "commons");
    expect(m?.config.unitLabel).toBe("Constituency");
    expect(m?.config.unitLabelPlural).toBe("Constituencies");
  });

  it("Japan maps votes by prefecture without inventing parliamentary seats", () => {
    for (const type of ["shugiin", "snap_shugiin", "sangiin", "governor", "regionalCouncil"]) {
      expect(getSubdivisionMode("JP", type)).toEqual({
        mode: "distributed",
        config: expect.objectContaining({
          dataDir: "subdivisions/jp",
          unitLabel: "Prefecture",
          unitLabelPlural: "Prefectures",
        }),
      });
    }
  });
  it("unknown pairs stay null", () => {
    expect(getSubdivisionMode("RU", "commons")).toBeNull();
    expect(getSubdivisionMode("DE", "landtag")).toBeNull();
  });
});
