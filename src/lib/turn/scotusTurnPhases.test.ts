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

import { processScotusTurn } from "./scotusTurn";

describe("processScotusTurn", () => {
  it("files NPP nominations and runs the surprise case turn every turn", async () => {
    const db = {} as Db;
    const result = await processScotusTurn(5, new Date(0), db);
    expect(m.npp).toHaveBeenCalledWith(5, db);
    expect(m.surprise).toHaveBeenCalledTimes(1);
    expect(m.surprise.mock.calls[0]).toHaveLength(5);
    expect(result.nppNominations).toEqual({ nominated: 1 });
  });
});
