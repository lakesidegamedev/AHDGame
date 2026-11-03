import { describe, it, expect } from "vitest";
import { statePopulationUpdate } from "./statePopulationUpdate";
describe("state population reference updates", () => {
  it("keeps existing population out of non-reset writes", () => {
    expect(statePopulationUpdate({ population: 10, name: "Wyoming" }, false)).toEqual({
      $set: { name: "Wyoming" },
      $setOnInsert: { population: 10 },
    });
  });
  it("still initializes reset population", () => {
    expect(statePopulationUpdate({ population: 10, name: "Wyoming" }, true)).toEqual({
      $set: { population: 10, name: "Wyoming" },
    });
  });
});
