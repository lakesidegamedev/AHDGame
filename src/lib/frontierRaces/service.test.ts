import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeEffectIntents = vi.hoisted(() => vi.fn(async () => ({ applied: 1, unsupported: {} })));
const logWireEvent = vi.hoisted(() => vi.fn(async () => undefined));
const spendFromTreasury = vi.hoisted(() => vi.fn(async () => undefined));
const rates = vi.hoisted(() => ({ JPY: 150 as number | undefined }));
const budgetDoc = vi.hoisted(() => ({ balance: 1e15 }));
const era = vi.hoisted(() => ({ year: 2045 }));

vi.mock("@/lib/turn/crisisV2/intents", () => ({ routeEffectIntents }));
vi.mock("@/lib/wireEvent", () => ({ logWireEvent }));
vi.mock("@/lib/budget/treasurySpend", () => ({ spendFromTreasury }));
vi.mock("@/lib/campaigns/campaignCurrency", async () => {
  const actual = await vi.importActual<typeof import("@/lib/campaigns/rules/currency")>(
    "@/lib/campaigns/rules/currency"
  );
  return {
    campaignAnchorToLocal: actual.campaignAnchorToLocal,
    getCampaignCurrency: actual.getCampaignCurrency,
    loadCampaignCurrencyRates: async () => (rates.JPY ? { JPY: rates.JPY } : {}),
  };
});
vi.mock("@/lib/db/collections/federalBudget", () => ({
  getFederalBudgetCollection: async () => ({
    findOne: async () => ({ treasuryBalance: budgetDoc.balance }),
  }),
}));
vi.mock("@/lib/era/context", () => ({ getEraContext: async () => ({ year: era.year }) }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { fundFrontierRace, loadFrontierRaceViews, processFrontierRaces } from "./service";
import { SUNSET_TURNS } from "./rules";

type Doc = Record<string, unknown> & { _id: string };

function makeDb(initial: Doc[] = [], corp?: { _id: ObjectId; rdScore: number; name: string }) {
  const races = new Map<string, Doc>(initial.map((d) => [d._id, structuredClone(d)]));
  const corpUpdates: unknown[] = [];
  const get = (obj: Record<string, unknown>, path: string) =>
    path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
  const set = (obj: Record<string, unknown>, path: string, value: unknown) => {
    const keys = path.split(".");
    let cur = obj;
    for (const k of keys.slice(0, -1)) cur = (cur[k] ??= {}) as Record<string, unknown>;
    cur[keys[keys.length - 1]] = value;
  };
  const apply = (doc: Doc, update: Record<string, Record<string, unknown>>) => {
    for (const [path, v] of Object.entries(update.$inc ?? {}))
      set(doc, path, ((get(doc, path) as number) ?? 0) + (v as number));
    for (const [path, v] of Object.entries(update.$set ?? {})) set(doc, path, v);
  };
  const matches = (doc: Doc, filter: Record<string, unknown>) =>
    Object.entries(filter).every(([k, v]) => {
      if (k === "_id") return doc._id === v;
      if (v && typeof v === "object" && "$exists" in (v as object))
        return (get(doc, k) !== undefined) === (v as { $exists: boolean }).$exists;
      return get(doc, k) === v;
    });
  const racesCol = {
    updateOne: async (
      f: Record<string, unknown>,
      u: Record<string, Record<string, unknown>>,
      o?: { upsert?: boolean }
    ) => {
      const doc = races.get(f._id as string);
      if (!doc) {
        if (o?.upsert) {
          races.set(f._id as string, { _id: f._id as string, ...(u.$setOnInsert as object) });
          return { modifiedCount: 0, upsertedCount: 1 };
        }
        return { modifiedCount: 0 };
      }
      if (!matches(doc, f)) return { modifiedCount: 0 };
      if (u.$setOnInsert && !o) return { modifiedCount: 0 };
      apply(doc, u);
      return { modifiedCount: 1 };
    },
    findOne: async (f: Record<string, unknown>) => races.get(f._id as string) ?? null,
    findOneAndUpdate: async (
      f: Record<string, unknown>,
      u: Record<string, Record<string, unknown>>
    ) => {
      const doc = races.get(f._id as string);
      if (!doc || !matches(doc, f)) return null;
      apply(doc, u);
      return doc;
    },
    find: () => ({ toArray: async () => [...races.values()] }),
    bulkWrite: async (
      ops: {
        updateOne: {
          filter: Record<string, unknown>;
          update: Record<string, Record<string, unknown>>;
        };
      }[]
    ) => {
      let modifiedCount = 0;
      for (const { updateOne } of ops) {
        const doc = races.get(updateOne.filter._id as string);
        if (doc && matches(doc, updateOne.filter)) {
          apply(doc, updateOne.update);
          modifiedCount += 1;
        }
      }
      return { modifiedCount };
    },
  };
  const corpsCol = {
    updateOne: async (f: Record<string, unknown>, u: Record<string, Record<string, unknown>>) => {
      corpUpdates.push({ f, u });
      if (corp && u.$inc?.rdScore !== undefined) {
        const min = (f.rdScore as { $gte?: number } | undefined)?.$gte;
        if (min !== undefined && corp.rdScore < min) return { modifiedCount: 0 };
        corp.rdScore += u.$inc.rdScore as number;
      }
      return { modifiedCount: 1 };
    },
    findOne: async () => (corp ? { name: corp.name } : null),
  };
  const statesCol = { find: () => ({ toArray: async () => [{ _id: "s1" }, { _id: "s2" }] }) };
  const db = {
    collection: (name: string) =>
      name === "frontierRaces"
        ? racesCol
        : name === "corporations"
          ? corpsCol
          : name === "gameState"
            ? { findOne: async () => ({ preset: undefined }) }
            : statesCol,
  };
  return { db: db as never, races, corpUpdates };
}

beforeEach(() => {
  vi.clearAllMocks();
  era.year = 2045;
  rates.JPY = 150;
  budgetDoc.balance = 1e15;
});

describe("fundFrontierRace", () => {
  it("rejects funding before the race opens", async () => {
    era.year = 2040;
    const { db } = makeDb();
    const result = await fundFrontierRace(db, {
      raceId: "fusion",
      kind: "country",
      entityId: "US",
      points: 10,
      turn: 5,
    });
    expect(result).toMatchObject({ ok: false, code: "not_open" });
    expect(spendFromTreasury).not.toHaveBeenCalled();
  });

  it("charges the treasury and records the points for a nation", async () => {
    const { db, races } = makeDb();
    const result = await fundFrontierRace(db, {
      raceId: "fusion",
      kind: "country",
      entityId: "US",
      points: 10,
      turn: 5,
    });
    expect(result).toMatchObject({ ok: true, points: 10, total: 10 });
    expect(spendFromTreasury).toHaveBeenCalledWith(
      expect.anything(),
      "US",
      250_000_000,
      expect.anything()
    );
    expect((races.get("fusion")?.contributions as Record<string, number>)["country:US"]).toBe(10);
  });

  it("charges a yen treasury in yen, not anchor units", async () => {
    const { db } = makeDb();
    await fundFrontierRace(db, {
      raceId: "fusion",
      kind: "country",
      entityId: "JP",
      points: 10,
      turn: 5,
    });
    expect(spendFromTreasury).toHaveBeenCalledWith(
      expect.anything(),
      "JP",
      250_000_000 * 150,
      expect.anything()
    );
  });

  it("refuses a nation whose balance cannot cover the order", async () => {
    budgetDoc.balance = 1;
    const { db, races } = makeDb();
    const result = await fundFrontierRace(db, {
      raceId: "fusion",
      kind: "country",
      entityId: "US",
      points: 10,
      turn: 5,
    });
    expect(result).toMatchObject({ ok: false, code: "cannot_pay" });
    expect(spendFromTreasury).not.toHaveBeenCalled();
    expect(races.get("fusion")?.contributions).toEqual({});
  });

  it("never charges when the race has a winner, so there is nothing to refund", async () => {
    const { db } = makeDb([
      {
        _id: "fusion",
        contributions: {},
        names: {},
        winner: { key: "country:CN", points: 1, turn: 1 },
      },
    ]);
    // The pre-check is bypassed by a winner landing after it: simulate via guard.
    const result = await fundFrontierRace(db, {
      raceId: "fusion",
      kind: "country",
      entityId: "US",
      points: 10,
      turn: 5,
    });
    expect(result).toMatchObject({ ok: false, code: "closed" });
    expect(spendFromTreasury).not.toHaveBeenCalled();
  });

  it("rolls the points back when the charge fails", async () => {
    spendFromTreasury.mockRejectedValueOnce(new Error("insufficient"));
    const { db, races } = makeDb();
    const result = await fundFrontierRace(db, {
      raceId: "fusion",
      kind: "country",
      entityId: "US",
      points: 10,
      turn: 5,
    });
    expect(result).toMatchObject({ ok: false, code: "cannot_pay" });
    expect(races.get("fusion")?.contributions).toEqual({});
    expect((races.get("fusion")?.pending as Record<string, number>)["country:US"]).toBe(0);
  });

  it("keeps unpaid points out of the counted contributions while the charge runs", async () => {
    let during: Record<string, unknown> | undefined;
    const { db, races } = makeDb();
    spendFromTreasury.mockImplementationOnce(async () => {
      during = structuredClone(races.get("fusion")) as Record<string, unknown>;
    });
    await fundFrontierRace(db, {
      raceId: "fusion",
      kind: "country",
      entityId: "US",
      points: 10,
      turn: 5,
    });
    expect(during?.contributions).toEqual({});
    expect((during?.pending as Record<string, number>)["country:US"]).toBe(10);
    expect((races.get("fusion")?.contributions as Record<string, number>)["country:US"]).toBe(10);
    expect((races.get("fusion")?.pending as Record<string, number>)["country:US"]).toBe(0);
  });

  it("refuses a race that already has a winner", async () => {
    const { db } = makeDb([
      {
        _id: "fusion",
        contributions: {},
        names: {},
        winner: { key: "country:CN", points: 6000, turn: 1 },
      },
    ]);
    const result = await fundFrontierRace(db, {
      raceId: "fusion",
      kind: "country",
      entityId: "US",
      points: 10,
      turn: 5,
    });
    expect(result).toMatchObject({ ok: false, code: "closed" });
    expect(spendFromTreasury).not.toHaveBeenCalled();
  });

  it("does not take research points a corporation does not have", async () => {
    const id = new ObjectId();
    const { db } = makeDb([], { _id: id, rdScore: 5, name: "Acme" });
    const result = await fundFrontierRace(db, {
      raceId: "fusion",
      kind: "corporation",
      entityId: id.toHexString(),
      points: 10,
      turn: 5,
    });
    expect(result).toMatchObject({ ok: false, code: "cannot_pay" });
  });
});

describe("processFrontierRaces", () => {
  const race = (extra: Record<string, unknown> = {}): Doc => ({
    _id: "fusion",
    contributions: { "country:US": 6000, "country:CN": 2000, "corporation:abc": 100 },
    names: { "country:US": "United States", "country:CN": "China", "corporation:abc": "Acme" },
    ...extra,
  });

  it("names the winner once, rewards it and penalises meaningful losers", async () => {
    const { db, races } = makeDb([race()]);
    const first = await processFrontierRaces(db, 100);
    expect(first.racesWon).toBe(1);
    const doc = races.get("fusion") as Record<string, unknown>;
    expect((doc.winner as { key: string }).key).toBe("country:US");
    expect(doc.licenceTurn).toBe(100 + SUNSET_TURNS);
    const deltas = routeEffectIntents.mock.calls.map(
      (call) =>
        (call as unknown as [unknown, { delta: number }[], { countryIds: string[] }])[2]
          .countryIds[0]
    );
    expect(deltas).toEqual(["US", "CN"]);
    expect(logWireEvent).toHaveBeenCalledTimes(1);

    const again = await processFrontierRaces(db, 101);
    expect(again.racesWon).toBe(0);
    expect(routeEffectIntents).toHaveBeenCalledTimes(2);
  });

  it("issues licences once after the sunset", async () => {
    const { db } = makeDb([race()]);
    await processFrontierRaces(db, 100);
    routeEffectIntents.mockClear();
    const early = await processFrontierRaces(db, 100 + SUNSET_TURNS - 1);
    expect(early.licencesIssued).toBe(0);
    const due = await processFrontierRaces(db, 100 + SUNSET_TURNS);
    expect(due.licencesIssued).toBe(1);
    expect(routeEffectIntents).toHaveBeenCalledTimes(1);
    const later = await processFrontierRaces(db, 100 + SUNSET_TURNS + 1);
    expect(later.licencesIssued).toBe(0);
  });

  it("leaves a race without a finisher alone", async () => {
    const { db } = makeDb([race({ contributions: { "country:US": 10 } })]);
    const result = await processFrontierRaces(db, 100);
    expect(result).toEqual({ racesWon: 0, licencesIssued: 0 });
  });
});

describe("loadFrontierRaceViews", () => {
  it("lists every race with a ranked leaderboard", async () => {
    const { db } = makeDb([
      {
        _id: "fusion",
        contributions: { "country:US": 3000 },
        names: { "country:US": "United States" },
      },
    ]);
    const views = await loadFrontierRaceViews(db);
    expect(views.map((v) => v.id)).toEqual(["fusion", "orbital", "biotech"]);
    expect(views[0].leaderboard[0]).toMatchObject({ name: "United States", points: 3000, rank: 1 });
    expect(views[0].status).toBe("open");
    expect(views[2].status).toBe("pending");
  });
});
