import { describe, expect, it } from "vitest";
import { energyActionLimits } from "./statDrift";
import { statBonus } from "./statMeta";

describe("statBonus energy", () => {
  it("reports the same cap and bank the engine uses, including fractional Energy", () => {
    for (const energy of [1, 4.4, 6.5, 7.6, 10]) {
      const { cap, threshold } = energyActionLimits(energy);
      const { label, detail } = statBonus("energy", energy);
      expect(label).toBe(`${cap} cap`);
      expect(detail).toBe(`${cap} action stockpile cap · bank up to ${threshold}`);
    }
  });
});
