import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/singleplayerTurn", () => ({
  advanceSingleplayerTurn: vi.fn(),
  checkSingleplayerTurnAllowed: vi.fn(),
}));
vi.mock("@/lib/singleplayerServer", () => ({ getSingleplayerConfig: vi.fn() }));
vi.mock("@/lib/singleplayerOperator", () => ({ getSingleplayerWorldAvailability: vi.fn() }));

import { NOTIFICATION_TYPES } from "@/lib/db/types/notifications";
import {
  BATCH_NOTIFICATION_TYPES,
  buildBatchDigest,
  detectBatchStop,
  getActiveSingleplayerBatch,
  getLatestSingleplayerBatch,
  isRaceRelevantToPlayer,
  requestSingleplayerBatchStop,
  resetSingleplayerBatchForTests,
  runBatch,
  startSingleplayerBatch,
  type BatchJob,
  type BatchNote,
  type BatchPorts,
  type BatchSnapshot,
} from "@/lib/singleplayerBatch";
import { checkSingleplayerTurnAllowed } from "@/lib/singleplayerTurn";

function snap(overrides: Partial<BatchSnapshot> & { turn: number }): BatchSnapshot {
  return {
    character: {
      funds: 1000,
      actions: 10,
      office: null,
      countryId: "US",
      homeState: "OH",
    },
    openElections: [],
    candidacies: [],
    ...overrides,
  };
}

function job(requested: number): BatchJob {
  return {
    id: "job",
    status: "running",
    requested,
    completed: 0,
    runningTurn: null,
    startTurn: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    stopRequested: false,
    stop: null,
    turns: [],
    digest: null,
  };
}

const n = (type: BatchNote["type"], title = type): BatchNote => ({ type, title });

describe("batch notification classification", () => {
  it("only names real notification types", () => {
    const real = new Set<string>(NOTIFICATION_TYPES);
    for (const type of BATCH_NOTIFICATION_TYPES) expect(real.has(type)).toBe(true);
  });
});

describe("detectBatchStop", () => {
  const before = snap({ turn: 5 });
  const after = snap({ turn: 6 });

  it("keeps going on a quiet turn", () => {
    expect(detectBatchStop(before, after, [n("resource_income"), n("welcome")])).toBeNull();
  });

  it.each([
    ["general_win", "election"],
    ["primary_loss", "election"],
    ["election_opened", "election"],
    ["bill_vote_open", "vote"],
    ["party_whip_issued", "vote"],
    ["crisis", "crisis"],
    ["player_attack", "crisis"],
    ["coalition_invite_received", "offer"],
    ["contract_offered", "offer"],
    ["leadership_lost", "office"],
    ["impeachment_convicted", "office"],
  ] as const)("stops on %s as %s", (type, kind) => {
    const stop = detectBatchStop(before, after, [n(type, "Headline")]);
    expect(stop?.kind).toBe(kind);
    expect(stop?.turn).toBe(6);
    expect(stop?.details).toEqual(["Headline"]);
  });

  it("stops when the character is gone", () => {
    const stop = detectBatchStop(before, snap({ turn: 6, character: null }), []);
    expect(stop?.kind).toBe("character");
  });

  it("stops when the held office disappears without a notice", () => {
    const held = snap({
      turn: 5,
      character: { funds: 1, actions: 1, office: "senate (OH)", countryId: "US", homeState: "OH" },
    });
    const stop = detectBatchStop(held, snap({ turn: 6 }), []);
    expect(stop?.kind).toBe("office");
    expect(stop?.details).toEqual(["You no longer hold senate (OH)"]);
  });

  it("does not call a change of office a loss", () => {
    const held = snap({
      turn: 5,
      character: { funds: 1, actions: 1, office: "house (OH)", countryId: "US", homeState: "OH" },
    });
    const moved = snap({
      turn: 6,
      character: { funds: 1, actions: 1, office: "senate (OH)", countryId: "US", homeState: "OH" },
    });
    expect(detectBatchStop(held, moved, [])).toBeNull();
  });

  it("stops when a race the player is running in is decided", () => {
    const running = snap({
      turn: 5,
      openElections: [
        { id: "e1", status: "active", electionType: "house", state: "OH", countryId: "US" },
      ],
      candidacies: ["e1"],
    });
    const stop = detectBatchStop(running, snap({ turn: 6, candidacies: ["e1"] }), []);
    expect(stop?.kind).toBe("election");
  });

  it("does not stop while their race is still open", () => {
    const race = {
      id: "e1",
      status: "active",
      electionType: "house",
      state: "OH",
      countryId: "US",
    };
    const running = snap({ turn: 5, openElections: [race], candidacies: ["e1"] });
    const still = snap({ turn: 6, openElections: [race], candidacies: ["e1"] });
    expect(detectBatchStop(running, still, [])).toBeNull();
  });

  it("stops when a race the player could enter opens, but not other states", () => {
    const own = { id: "e2", status: "active", electionType: "house", state: "OH", countryId: "US" };
    const other = {
      id: "e3",
      status: "active",
      electionType: "house",
      state: "TX",
      countryId: "US",
    };
    expect(detectBatchStop(before, snap({ turn: 6, openElections: [other] }), [])).toBeNull();
    const stop = detectBatchStop(before, snap({ turn: 6, openElections: [own, other] }), []);
    expect(stop?.kind).toBe("election");
    expect(stop?.details).toEqual(["A new race opened that you could run in"]);
  });

  it("ignores races that were already open before the turn", () => {
    const own = { id: "e2", status: "active", electionType: "house", state: "OH", countryId: "US" };
    const had = snap({ turn: 5, openElections: [own] });
    expect(detectBatchStop(had, snap({ turn: 6, openElections: [own] }), [])).toBeNull();
  });

  it("reports the most serious reason and lists the rest", () => {
    const stop = detectBatchStop(before, after, [
      n("coalition_invite_received", "Invite"),
      n("bill_vote_open", "Budget vote"),
      n("crisis", "Border crisis"),
    ]);
    expect(stop?.kind).toBe("vote");
    expect(stop?.details).toEqual(["Budget vote"]);
  });

  it("treats a nationwide race as relevant to everyone in the country", () => {
    const character = before.character!;
    expect(
      isRaceRelevantToPlayer(
        {
          id: "p",
          status: "active",
          electionType: "president",
          state: "national",
          countryId: "US",
        },
        character
      )
    ).toBe(true);
    expect(
      isRaceRelevantToPlayer(
        {
          id: "p",
          status: "active",
          electionType: "president",
          state: "national",
          countryId: "FR",
        },
        character
      )
    ).toBe(false);
  });
});

describe("buildBatchDigest", () => {
  it("sums funds and actions and groups the inbox by category", () => {
    const digest = buildBatchDigest({
      start: snap({ turn: 10 }),
      end: snap({
        turn: 13,
        character: {
          funds: 1750,
          actions: 4,
          office: "senate (OH)",
          countryId: "US",
          homeState: "OH",
        },
      }),
      turnsPlayed: 3,
      notes: [
        n("bill_vote_open", "Vote A"),
        n("bill_vote_open", "Vote B"),
        n("general_win", "You won"),
        n("wire_received", "Wire"),
        n("turn_advance", "Turn done"),
      ],
      worldEvents: [{ turn: 12, title: "New leader" }],
      warnings: ["Optional summary unavailable"],
    });
    expect(digest.funds).toEqual({ before: 1000, after: 1750, delta: 750 });
    expect(digest.actions).toEqual({ before: 10, after: 4, delta: -6 });
    expect(digest.office).toEqual({ before: null, after: "senate (OH)" });
    expect(digest.officesWon).toEqual(["You won"]);
    expect(digest.officesLost).toEqual([]);
    expect(digest.inbox.total).toBe(4);
    expect(digest.inbox.actionRequired).toBe(2);
    expect(digest.inbox.groups.map((g) => [g.category, g.count])).toEqual([
      ["legislation", 2],
      ["election", 1],
      ["treasury", 1],
    ]);
    expect(digest.worldEvents).toEqual([{ turn: 12, title: "New leader" }]);
    expect(digest.warnings).toEqual(["Optional summary unavailable"]);
  });
});

function fakePorts(script: Array<{ notes?: BatchNote[]; after: BatchSnapshot; ok?: boolean }>) {
  let step = 0;
  let current = snap({ turn: 1 });
  const ports: BatchPorts = {
    advance: vi.fn(async () => {
      const next = script[step]!;
      if (next.ok === false) return { ok: false as const, status: 500, error: "Engine failed" };
      return {
        ok: true as const,
        turn: next.after.turn ?? 0,
        message: "done",
        warnings: [],
        briefing: { funds: 0, fundsDelta: 100, actions: 0, actionsDelta: 2 },
        durationSeconds: 0.1,
      };
    }),
    snapshot: vi.fn(async () => current),
    notesSince: vi.fn(async () => script[step - 1]?.notes ?? []),
    historyBetween: vi.fn(async () => []),
  };
  const originalAdvance = ports.advance;
  ports.advance = vi.fn(async () => {
    const result = await originalAdvance();
    if (result.ok) {
      current = script[step]!.after;
      step += 1;
    }
    return result;
  });
  return ports;
}

describe("runBatch", () => {
  it("plays every requested turn when nothing needs the player", async () => {
    const ports = fakePorts([
      { after: snap({ turn: 2 }) },
      { after: snap({ turn: 3 }) },
      { after: snap({ turn: 4 }) },
    ]);
    const j = job(3);
    await runBatch(j, ports);
    expect(j.status).toBe("finished");
    expect(j.completed).toBe(3);
    expect(j.stop).toBeNull();
    expect(j.turns.map((t) => t.turn)).toEqual([2, 3, 4]);
    expect(j.digest?.turnsPlayed).toBe(3);
    expect(j.digest?.startTurn).toBe(1);
    expect(j.digest?.endTurn).toBe(4);
  });

  it("stops after the turn that needs the player and says why", async () => {
    const ports = fakePorts([
      { after: snap({ turn: 2 }) },
      { after: snap({ turn: 3 }), notes: [n("bill_vote_open", "Budget vote")] },
      { after: snap({ turn: 4 }) },
    ]);
    const j = job(5);
    await runBatch(j, ports);
    expect(j.completed).toBe(2);
    expect(j.stop).toMatchObject({ kind: "vote", turn: 3, details: ["Budget vote"] });
    expect(ports.advance).toHaveBeenCalledTimes(2);
    expect(j.digest?.inbox.actionRequired).toBe(1);
  });

  it("reports a turn error and keeps the committed turns in the digest", async () => {
    const ports = fakePorts([
      { after: snap({ turn: 2 }) },
      { after: snap({ turn: 3 }), ok: false },
    ]);
    const j = job(3);
    await runBatch(j, ports);
    expect(j.completed).toBe(1);
    expect(j.stop).toMatchObject({ kind: "error", message: "Engine failed", turn: 2 });
    expect(j.digest?.turnsPlayed).toBe(1);
    expect(j.status).toBe("finished");
  });

  it("turns a thrown failure into an error stop instead of rejecting", async () => {
    const ports = fakePorts([{ after: snap({ turn: 2 }) }]);
    ports.advance = vi.fn(async () => {
      throw new Error("boom");
    });
    const j = job(2);
    await expect(runBatch(j, ports)).resolves.toBeUndefined();
    expect(j.stop).toMatchObject({ kind: "error", message: "boom" });
    expect(j.status).toBe("finished");
  });

  it("stops after the current turn when asked", async () => {
    const j = job(5);
    const ports = fakePorts([
      { after: snap({ turn: 2 }) },
      { after: snap({ turn: 3 }) },
      { after: snap({ turn: 4 }) },
    ]);
    const original = ports.advance;
    ports.advance = vi.fn(async () => {
      const result = await original();
      j.stopRequested = true;
      return result;
    });
    await runBatch(j, ports);
    expect(j.completed).toBe(1);
    expect(j.stop).toMatchObject({ kind: "requested" });
    expect(j.digest?.turnsPlayed).toBe(1);
  });

  it("stops when the character dies mid-batch", async () => {
    const ports = fakePorts([
      { after: snap({ turn: 2 }) },
      { after: snap({ turn: 3, character: null }) },
    ]);
    const j = job(5);
    await runBatch(j, ports);
    expect(j.stop?.kind).toBe("character");
    expect(j.completed).toBe(2);
    expect(j.digest?.office.after).toBeNull();
  });
});

describe("batch registry", () => {
  beforeEach(() => {
    resetSingleplayerBatchForTests();
    vi.mocked(checkSingleplayerTurnAllowed).mockResolvedValue({
      ok: true,
      character: { _id: "c" as never },
    });
  });

  it("rejects out-of-range counts", async () => {
    for (const turns of [0, 11, 2.5]) {
      const result = await startSingleplayerBatch({} as never, turns, fakePorts([]));
      expect(result).toMatchObject({ ok: false, status: 400 });
    }
  });

  it("passes a refused gate straight back", async () => {
    vi.mocked(checkSingleplayerTurnAllowed).mockResolvedValue({
      ok: false,
      status: 409,
      error: "Resume the world before ending a turn.",
    });
    const result = await startSingleplayerBatch({} as never, 3, fakePorts([]));
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(getLatestSingleplayerBatch()).toBeNull();
  });

  it("allows one running batch at a time and exposes the result afterwards", async () => {
    const ports = fakePorts([{ after: snap({ turn: 2 }) }, { after: snap({ turn: 3 }) }]);
    const first = await startSingleplayerBatch({} as never, 2, ports);
    expect(first.ok).toBe(true);
    expect(getActiveSingleplayerBatch()).not.toBeNull();
    const second = await startSingleplayerBatch({} as never, 2, fakePorts([]));
    expect(second).toMatchObject({ ok: false, status: 409 });
    expect(requestSingleplayerBatchStop()?.stopRequested).toBe(true);
    if (first.ok) await first.done;
    expect(getActiveSingleplayerBatch()).toBeNull();
    expect(getLatestSingleplayerBatch()?.status).toBe("finished");
    expect(requestSingleplayerBatchStop()).toBeNull();
  });
});
