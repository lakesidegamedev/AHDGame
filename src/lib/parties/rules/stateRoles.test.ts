import { describe, expect, it } from "vitest";
import { stateRoleLabel, stateRolesByPerson } from "./stateRoles";

describe("stateRolesByPerson", () => {
  it("maps each office holder to their state offices", () => {
    const m = stateRolesByPerson([
      { stateId: "OH", chairId: "a", treasurerId: "b" },
      { stateId: "IA", chairId: "a", viceChairId: null },
    ]);
    expect(m.get("a")).toEqual([
      { stateId: "IA", role: "chair" },
      { stateId: "OH", role: "chair" },
    ]);
    expect(m.get("b")).toEqual([{ stateId: "OH", role: "treasurer" }]);
    expect(m.get("c")).toBeUndefined();
  });
  it("labels a role with its region", () => {
    expect(stateRoleLabel({ stateId: "OH", role: "viceChair" }, "Ohio")).toBe("Ohio Vice Chair");
  });
});
