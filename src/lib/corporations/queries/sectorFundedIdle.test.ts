import { describe, expect, it } from "vitest";
import { fundedIdleWeights } from "./sectorFundedIdle";

describe("fundedIdleWeights", () => {
  it("names the input that cut the run", () => {
    const weights = fundedIdleWeights(
      {
        turn: 10,
        activeUnits: 100,
        offeredUnits: 50,
        soldUnits: 50,
        producedUnits: 50,
        plannedRunShare: 1,
        billedRunShare: 0.5,
        runCutBy: ["inputs"],
        bindingInput: "steel",
      } as never,
      10
    );
    const inputs = weights?.find((w) => w.cause === "inputs");
    expect(inputs?.heldInput).toBe("Steel & Metals");
  });
});
