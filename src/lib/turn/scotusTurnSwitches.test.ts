import type { Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  surprise: vi.fn().mockResolvedValue({ spawned: false, decided: 0 }),
  npp: vi.fn().mockResolvedValue({ nominated: 1 }),
}));

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("./scotusTenureTurn", () => ({ processScotusTenureTurn: vi.fn() }));
vi.mock("./scotusDocketTurn", () => ({ processScotusDocketTurn: vi.fn() }));
vi.mock("./scotusSurpriseCaseTurn", () => ({ processScotusSurpriseCaseTurn: m.surprise }));
vi.mock("./scotusNppNominationTurn", () => ({ processScotusNppNominations: m.npp }));
vi.mock("./scotusNominationLifecycle", () => ({ processScotusNominationLifecycle: vi.fn() }));

import { processScotusTurn, scotusSwitches } from "./scotusTurn";

const db = {} as Db;

describe("processScotusTurn live-world switches", () => {
  it("files no NPP nomination and rules at once on a world with both switches off", async () => {
    const result = await processScotusTurn(5, new Date(0), db, {
      nppNominations: false,
      pendingDocket: false,
    });
    expect(m.npp).not.toHaveBeenCalled();
    expect(result.nppNominations).toEqual({ nominated: 0, skipped: "disabled" });
    expect(m.surprise.mock.calls[0][5]).toBe(false);
  });

  it("runs both when the switches are on", async () => {
    await processScotusTurn(5, new Date(0), db, { nppNominations: true, pendingDocket: true });
    expect(m.npp).toHaveBeenCalledWith(5, db);
    expect(m.surprise.mock.calls.at(-1)![5]).toBe(true);
  });

  it("reads both switches off from a config that predates them", () => {
    expect(scotusSwitches({})).toEqual({ nppNominations: false, pendingDocket: false });
    expect(scotusSwitches(null)).toEqual({ nppNominations: false, pendingDocket: false });
    expect(
      scotusSwitches({ scotusNppNominationsEnabled: true, scotusPendingDocketEnabled: true })
    ).toEqual({ nppNominations: true, pendingDocket: true });
  });
});
