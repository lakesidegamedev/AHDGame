import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import type { ActionRecommendation } from "@/lib/actions/recommendations";
import {
  ADVICE_TTL_MS,
  careForKeir,
  chooseAdvice,
  heartsFor,
  loadKeirPet,
  registerVisit,
  TEA_COOLDOWN_MS,
} from "./keirPet";

const NOW = new Date("2026-10-30T12:00:00Z");

function rec(id: string, priority: ActionRecommendation["priority"]): ActionRecommendation {
  return {
    id,
    priority,
    category: "stat-recovery",
    title: `Title ${id}`,
    why: `Why ${id}`,
    action: { type: "x", estimatedCost: { ap: 0, funds: 0 }, estimatedBenefit: "" },
    link: `/go/${id}`,
  };
}

function fakeUsers(keirPet: unknown, modifiedCount = 1) {
  const users = {
    findOne: vi.fn().mockResolvedValue({ _id: new ObjectId(), keirPet }),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount }),
  };
  return { db: { collection: () => users } as unknown as Db, users };
}

describe("Keir's advice", () => {
  it("leads with the most urgent recommendation and sets his tone from it", () => {
    const advice = chooseAdvice(
      [rec("a", "low"), rec("b", "critical"), rec("c", "high")],
      undefined,
      NOW
    );
    expect(advice).toMatchObject({ id: "b", title: "Title b", link: "/go/b", tone: "warn" });
  });

  it("does not repeat the last tip when there is another", () => {
    expect(chooseAdvice([rec("b", "critical"), rec("c", "high")], "b", NOW).id).toBe("c");
  });

  it("falls back to a true evergreen tip, rotating away from the last one", () => {
    const first = chooseAdvice([], undefined, NOW);
    expect(first.id).toMatch(/^tip-/);
    expect(chooseAdvice([], first.id, NOW).id).not.toBe(first.id);
  });
});

describe("bond and streak", () => {
  it("fills five hearts at the bond thresholds", () => {
    expect(heartsFor(0)).toEqual({ hearts: 0, nextHeartAt: 10 });
    expect(heartsFor(30)).toEqual({ hearts: 2, nextHeartAt: 60 });
    expect(heartsFor(999)).toEqual({ hearts: 5, nextHeartAt: null });
  });

  it("grows the streak on consecutive days and restarts it after a gap", () => {
    const base = { bond: 0, streak: 3 };
    expect(registerVisit({ ...base, lastVisitDay: "2026-10-29" }, NOW)).toMatchObject({
      streak: 4,
      bond: 2,
    });
    expect(registerVisit({ ...base, lastVisitDay: "2026-10-27" }, NOW)).toMatchObject({
      streak: 1,
    });
    const same = { ...base, lastVisitDay: "2026-10-30" };
    expect(registerVisit(same, NOW)).toBe(same);
  });
});

describe("loadKeirPet", () => {
  it("writes a fresh tip and counts the visit for a first-time player", async () => {
    const { db, users } = fakeUsers(undefined);
    const load = vi.fn().mockResolvedValue({ recommendations: [rec("x", "high")] });
    const pet = await loadKeirPet(db, new ObjectId().toString(), load, NOW);
    expect(pet).toMatchObject({ advice: { id: "x", tone: "nudge" }, streak: 1, bond: 2 });
    expect(users.updateOne).toHaveBeenCalledOnce();
  });

  it("keeps the same tip for 12 hours and writes nothing on a repeat visit", async () => {
    const advice = {
      id: "x",
      title: "T",
      why: "W",
      link: null,
      tone: "idea",
      generatedAt: new Date(NOW.getTime() - ADVICE_TTL_MS + 60_000).toISOString(),
    };
    const { db, users } = fakeUsers({ bond: 5, streak: 2, lastVisitDay: "2026-10-30", advice });
    const load = vi.fn();
    const pet = await loadKeirPet(db, new ObjectId().toString(), load, NOW);
    expect(pet?.advice.id).toBe("x");
    expect(load).not.toHaveBeenCalled();
    expect(users.updateOne).not.toHaveBeenCalled();
  });

  it("regenerates once the tip is 12 hours old, and survives a failed lookup", async () => {
    const advice = {
      id: "x",
      title: "T",
      why: "W",
      link: null,
      tone: "idea",
      generatedAt: new Date(NOW.getTime() - ADVICE_TTL_MS).toISOString(),
    };
    const { db } = fakeUsers({ bond: 5, streak: 2, lastVisitDay: "2026-10-30", advice });
    const pet = await loadKeirPet(
      db,
      new ObjectId().toString(),
      vi.fn().mockRejectedValue(new Error("down")),
      NOW
    );
    expect(pet?.advice.id).toMatch(/^tip-/);
  });
});

describe("careForKeir", () => {
  it("adds bond for tea and starts the cooldown", async () => {
    const { db, users } = fakeUsers({ bond: 9, streak: 1 });
    const pet = await careForKeir(db, new ObjectId().toString(), "tea", NOW);
    expect(pet).toMatchObject({ bond: 12, hearts: 1 });
    expect(pet?.teaReadyAt).toBe(new Date(NOW.getTime() + TEA_COOLDOWN_MS).toISOString());
    expect(users.updateOne.mock.calls[0]![1]).toMatchObject({ $inc: { "keirPet.bond": 3 } });
  });

  it("refuses while on cooldown, including a second click racing the first", async () => {
    const recent = { bond: 9, streak: 1, teaAt: new Date(NOW.getTime() - 60_000) };
    expect(
      await careForKeir(fakeUsers(recent).db, new ObjectId().toString(), "tea", NOW)
    ).toBeNull();
    const raced = fakeUsers({ bond: 9, streak: 1 }, 0);
    expect(await careForKeir(raced.db, new ObjectId().toString(), "pat", NOW)).toBeNull();
  });
});
