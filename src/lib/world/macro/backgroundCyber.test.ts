import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gameConfig/liveWorldSwitches", () => ({
  isLiveWorldSwitchOn: vi.fn(async () => true),
}));
vi.mock("@/lib/coldwar/tension", () => ({
  getColdWarTension: vi.fn(async () => ({ value: 90 })),
}));
const resilience = vi.fn(async (_db: unknown, ids: string[]) =>
  ids.map((countryId) => ({ countryId, resilience: 0.1 }))
);
vi.mock("@/lib/cyber/resilience", () => ({ loadCyberResilience: resilience }));

const NO_HISTORY = { lastOperationTurn: null, truceUntilTurn: null };
const histories = vi.fn(
  async (_db: unknown, pairs: { attackerId: string; targetId: string }[]) =>
    new Map(pairs.map((p) => [`${p.attackerId}>${p.targetId}`, NO_HISTORY]))
);
const launch = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/cyber/runCyberOperation", () => ({
  cyberPairKey: (attackerId: string, targetId: string) => `${attackerId}>${targetId}`,
  loadCyberPairHistories: histories,
  loadCyberCrisisTargets: vi.fn(async () => new Set<string>()),
  launchCyberOperation: launch,
  standDownCyber: vi.fn(async () => ({ ok: true })),
}));

const { applyScriptedCyber, scriptedRoll } = await import("./backgroundCyber");

const db = {} as Db;
const plan = (countryId: string, hawkishness: number) => ({
  countryId,
  state: { bloc: "us", stance: { hawkishness } },
});

beforeEach(() => vi.clearAllMocks());

describe("applyScriptedCyber reads", () => {
  it("loads pair history and target resilience once for every government in the tick", async () => {
    const plans = [plan("GB", 1), plan("FR", 1), plan("DE", 1), plan("IT", 0)];
    await applyScriptedCyber(db, plans as never, 500);
    expect(histories).toHaveBeenCalledTimes(1);
    expect(histories.mock.calls[0][1]).toHaveLength(4);
    expect(resilience).toHaveBeenCalledTimes(1);
    expect(resilience.mock.calls[0][1]).toEqual(["CN"]);
  });

  it("reads no resilience when no government has anything to decide", async () => {
    await applyScriptedCyber(db, [plan("IT", 0)] as never, 500);
    expect(histories).toHaveBeenCalledTimes(1);
    expect(resilience).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
  });

  it("keeps the per-country roll stable across a retried tick", () => {
    expect(scriptedRoll("GB", 500)).toBe(scriptedRoll("GB", 500));
  });
});
