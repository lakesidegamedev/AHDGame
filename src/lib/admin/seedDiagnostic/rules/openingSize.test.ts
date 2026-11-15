import { describe, expect, it } from "vitest";
import { nppOpeningUnits } from "@/lib/admin/seed/rules/nppOpeningSize";
import { openingSizeDeviations } from "./openingSize";

describe("openingSizeDeviations", () => {
  it("accepts rows at the standard opening size", () => {
    expect(
      openingSizeDeviations([
        { lane: "retail", capacityUnits: nppOpeningUnits("retail") },
        { lane: "energy", capacityUnits: nppOpeningUnits("energy") },
      ])
    ).toEqual([]);
  });

  it("reports a lane opened above or below the standard size", () => {
    const expected = nppOpeningUnits("retail");
    expect(openingSizeDeviations([{ lane: "retail", capacityUnits: expected * 3 }])).toEqual([
      { lane: "retail", expected, actual: expected * 3 },
    ]);
  });
});
