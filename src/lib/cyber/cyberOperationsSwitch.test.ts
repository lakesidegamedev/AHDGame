import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const switchState = { on: false };
vi.mock("@/lib/gameConfig/liveWorldSwitches", () => ({
  isLiveWorldSwitchOn: vi.fn(async () => switchState.on),
}));
const launch = vi.fn(async () => ({ ok: true }));
const standDown = vi.fn(async () => ({ ok: true }));
const pairHistory = vi.fn(async () => ({ lastOperationTurn: null, truceUntilTurn: null }));
vi.mock("@/lib/cyber/runCyberOperation", () => ({
  launchCyberOperation: launch,
  standDownCyber: standDown,
  loadCyberPairHistory: pairHistory,
  loadCyberCrisisTargets: vi.fn(async () => new Set<string>()),
  loadCyberLaunchTurns: vi.fn(async () => []),
}));
const cabinetFind = vi.fn(async () => null);
vi.mock("@/lib/db/collections/cabinetMembers", () => ({
  getCabinetMembersCollection: () => ({ findOne: cabinetFind }),
}));
const tension = vi.fn(async () => ({ value: 90 }));
vi.mock("@/lib/coldwar/tension", () => ({ getColdWarTension: tension }));

const { processAutonomousCyber } = await import("@/lib/nppAutonomy/autonomousCyber");
const { applyScriptedCyber } = await import("@/lib/world/macro/backgroundCyber");

const db = {} as Db;
const HEAD = { personality: { ambition: 10 }, policies: { domainPositions: { defense: 10 } } };
const PLAN = { countryId: "RU", state: { bloc: "cn", stance: { hawkishness: 1 } } };

beforeEach(() => {
  switchState.on = false;
  vi.clearAllMocks();
});

describe("cyber operations switch on computer-run governments", () => {
  it("both paths reach a launch decision once the switch is on", async () => {
    switchState.on = true;
    // The stub database stops each path after its first read; reaching that read is the point.
    await processAutonomousCyber(db, "CN", HEAD as never, 500).catch(() => undefined);
    expect(cabinetFind).toHaveBeenCalled();
    await applyScriptedCyber(db, [PLAN as never], 500).catch(() => undefined);
    expect(tension).toHaveBeenCalled();
  });

  it("an NPP government reads nothing and launches nothing while the switch is off", async () => {
    const result = await processAutonomousCyber(db, "CN", HEAD as never, 500);
    expect(result).toBe("none");
    expect(cabinetFind).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
  });

  it("a background government reads nothing and launches nothing while the switch is off", async () => {
    const result = await applyScriptedCyber(db, [PLAN as never], 500);
    expect(result).toEqual({ launched: 0, standDowns: 0 });
    expect(tension).not.toHaveBeenCalled();
    expect(pairHistory).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
  });
});
