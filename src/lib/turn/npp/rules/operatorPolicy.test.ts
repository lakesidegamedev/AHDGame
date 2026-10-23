import { describe, expect, it } from "vitest";
import {
  operatorAllowsPlacement,
  operatorMay,
  operatorRole,
  resolveOperatorPermissions,
} from "./operatorPolicy";

const npp = { autopilot: false, caretaker: false, ownedByParent: false };
const autopilot = { autopilot: true, caretaker: false, ownedByParent: false };

describe("role defaults reproduce behavior before policies", () => {
  it("lets an NPP corporation do everything", () => {
    const p = resolveOperatorPermissions(npp, undefined);
    for (const action of Object.keys(p.actions) as Array<keyof typeof p.actions>) {
      expect(operatorMay(p, action)).toBe(true);
    }
    expect(p.sectorTypes).toBeNull();
    expect(p.countryIds).toBeNull();
  });

  it("keeps autopilot from borrowing and retooling, and asks before divesting or researching", () => {
    const p = resolveOperatorPermissions(autopilot, undefined);
    expect(p.actions).toMatchObject({
      divest: "ask",
      research: "ask",
      retool: "never",
      borrow: "never",
      found: "allow",
      grow: "allow",
      budgets: "allow",
      dividends: "allow",
    });
  });

  it("keeps a parent-owned AI corporation from divesting or retooling the parent's plants", () => {
    const p = resolveOperatorPermissions({ ...npp, ownedByParent: true }, undefined);
    expect(p.actions.divest).toBe("never");
    expect(p.actions.retool).toBe("never");
    expect(p.actions.grow).toBe("allow");
  });

  it("names the role", () => {
    expect(operatorRole(autopilot)).toBe("autopilot");
    expect(operatorRole({ autopilot: false, caretaker: true })).toBe("caretaker");
    expect(operatorRole(npp)).toBe("npp");
  });
});

describe("owner policy", () => {
  it("overrides a role default per action", () => {
    const p = resolveOperatorPermissions(autopilot, {
      setTurn: 1,
      actions: { divest: "allow", grow: "never" },
    });
    expect(operatorMay(p, "divest")).toBe(true);
    expect(operatorMay(p, "grow")).toBe(false);
    expect(p.actions.borrow).toBe("never");
  });

  it("lets a parent-owned corporation divest only when the owner says so", () => {
    const p = resolveOperatorPermissions(
      { ...npp, ownedByParent: true },
      { setTurn: 1, actions: { divest: "allow" } }
    );
    expect(operatorMay(p, "divest")).toBe(true);
  });

  it("reads ask as never where the owner has no advisory to read", () => {
    const p = resolveOperatorPermissions(autopilot, {
      setTurn: 1,
      actions: { found: "ask", divest: "ask", budgets: "ask" },
    });
    expect(p.actions.found).toBe("never");
    expect(p.actions.budgets).toBe("never");
    expect(p.actions.divest).toBe("ask");
    const caretaker = resolveOperatorPermissions(
      { autopilot: false, caretaker: true, ownedByParent: false },
      { setTurn: 1, actions: { divest: "ask", research: "ask" } }
    );
    expect(caretaker.actions.divest).toBe("never");
    expect(caretaker.actions.research).toBe("never");
  });

  it("limits placement by sector type and country, and treats empty lists as unrestricted", () => {
    const p = resolveOperatorPermissions(npp, {
      setTurn: 1,
      sectorTypes: ["energy"],
      countryIds: ["US"],
    });
    expect(operatorAllowsPlacement(p, "energy", "US")).toBe(true);
    expect(operatorAllowsPlacement(p, "retail", "US")).toBe(false);
    expect(operatorAllowsPlacement(p, "energy", "CA")).toBe(false);
    const open = resolveOperatorPermissions(npp, { setTurn: 1, sectorTypes: [], countryIds: [] });
    expect(operatorAllowsPlacement(open, "retail", "CA")).toBe(true);
  });
});
