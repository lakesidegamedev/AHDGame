import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  switchOn: vi.fn(),
  presidential: vi.fn(),
  successions: vi.fn(),
}));

vi.mock("@/lib/gameConfig/liveWorldSwitches", () => ({ isLiveWorldSwitchOn: m.switchOn }));
vi.mock("@/lib/turn/presidentialSuccession", () => ({
  processPresidentialSuccession: m.presidential,
}));
vi.mock("@/lib/elections/resolution/executiveSuccession", () => ({
  processSuccessions: m.successions,
}));

import { processSuccessionsAndFills } from "./executiveSuccessionFill";

const db = {} as Db;
const now = new Date("2026-11-11T00:00:00Z");

beforeEach(() => vi.clearAllMocks());

describe("executive succession switch", () => {
  it("keeps only the US President-to-VP succession on a world with the switch off", async () => {
    m.switchOn.mockResolvedValue(false);
    await processSuccessionsAndFills(db, 818, now);
    expect(m.switchOn).toHaveBeenCalledWith(db, "executiveSuccessionEnabled");
    expect(m.presidential).toHaveBeenCalledWith(db);
    expect(m.successions).not.toHaveBeenCalled();
  });

  it("runs the succession watcher when the switch is on", async () => {
    m.switchOn.mockResolvedValue(true);
    m.successions.mockRejectedValue(new Error("stop before fills"));
    await expect(processSuccessionsAndFills(db, 818, now)).rejects.toThrow("stop before fills");
    expect(m.successions).toHaveBeenCalledWith(db, 818, now);
    expect(m.presidential).not.toHaveBeenCalled();
  });
});
