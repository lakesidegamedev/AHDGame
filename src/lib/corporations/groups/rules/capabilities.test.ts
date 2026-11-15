import { describe, it, expect } from "vitest";
import { groupCapabilities } from "./capabilities";
describe("independent Group capabilities", () => {
  it("runs strategic directions without activating the separate supply engine", () => {
    expect(
      groupCapabilities({
        marketSystemMode: "plants",
        groupSupplyCoordinationEnabled: false,
      })
    ).toEqual({ directionsEnabled: true, supplyEngineEnabled: false, internalSupplyEnabled: true });
  });
  it("preserves exclusive supply routing and its market gates", () => {
    for (const marketSystemMode of ["off", "capital", "plants"])
      for (const groupSupplyCoordinationEnabled of [false, true]) {
        const c = groupCapabilities({ marketSystemMode, groupSupplyCoordinationEnabled });
        expect(c.directionsEnabled).toBe(true);
        expect(c.supplyEngineEnabled).toBe(
          marketSystemMode === "plants" && groupSupplyCoordinationEnabled
        );
        expect(c.internalSupplyEnabled).toBe(
          marketSystemMode === "plants" && !c.supplyEngineEnabled
        );
      }
  });
});
