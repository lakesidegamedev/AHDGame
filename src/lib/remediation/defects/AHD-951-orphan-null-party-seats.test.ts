import { ObjectId, type Db } from "mongodb";
import { describe, expect, it } from "vitest";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { HealContext, HealPlan } from "../types";
import { defect } from "./AHD-951-orphan-null-party-seats";

const ctx: HealContext = { env: "prod", dryRun: true, now: new Date("2026-11-02T12:00:00Z") };

type Doc = Record<string, unknown>;

/** A holder-less commons bloc: the shape a vacate leaves behind. */
function bloc(overrides: Doc = {}): Doc {
  return {
    _id: new ObjectId(),
    countryId: "UK",
    officeType: "commons",
    state: "LON",
    party: null,
    characterId: null,
    nppId: null,
    seatsHeld: 26,
    ...overrides,
  };
}

/** A UK Commons vacancy pointing at the bloc it was vacated from. */
function vacancy(officialId: unknown, status: "open" | "scheduled" | "filled" | "subsumed"): Doc {
  return {
    _id: new ObjectId(),
    countryId: "UK",
    state: "LON",
    officialId,
    seats: 26,
    status,
  };
}

/** The in-memory store is a `Db` for the defect contract and keeps its own seed/collection helpers. */
function world(seed: { officials: Doc[]; vacancies?: Doc[] }): InMemoryDb & Db {
  const memory = createInMemoryDb();
  memory.seed("electedOfficials", seed.officials);
  memory.seed("ukCommonsVacancies", seed.vacancies ?? []);
  return memory as unknown as InMemoryDb & Db;
}

describe("AHD-951 vacancy-anchor exclusion", () => {
  it("leaves a by-election anchor alone and still flags a genuine orphan", async () => {
    const anchor = bloc();
    const orphan = bloc({ state: "NEE", seatsHeld: 14 });
    const db = world({
      officials: [anchor, orphan],
      vacancies: [vacancy(anchor._id, "scheduled")],
    });

    const detected = await defect.detect(db, ctx);

    expect(detected.affected).toBe(1);
    expect(detected.sample).toEqual([
      expect.objectContaining({ id: String(orphan._id), state: "NEE", seatsHeld: 14 }),
    ]);
    expect(detected.notes?.join(" ")).toContain(
      "1 shape-matched bloc(s) are UK Commons vacancy anchors"
    );
  });

  it("plans to delete only the unanchored orphan", async () => {
    const anchor = bloc();
    const orphan = bloc({ state: "NEE", seatsHeld: 14 });
    const db = world({
      officials: [anchor, orphan],
      vacancies: [vacancy(anchor._id, "open")],
    });

    const healPlan = await defect.plan(db, ctx);

    expect(healPlan.affected).toBe(1);
    expect(healPlan.touched).toEqual([
      { collection: "electedOfficials", ids: [String(orphan._id)] },
    ]);
    expect(healPlan.summary).toBe("delete 1 orphan null-party bloc(s) holding 14 phantom seat(s)");
  });

  it("treats filled and subsumed vacancies as anchors too: the row still explains them", async () => {
    const filled = bloc();
    const subsumed = bloc({ state: "NEE" });
    const db = world({
      officials: [filled, subsumed],
      vacancies: [vacancy(filled._id, "filled"), vacancy(subsumed._id, "subsumed")],
    });

    const detected = await defect.detect(db, ctx);
    expect(detected.affected).toBe(0);
    expect(detected.notes?.join(" ")).toContain(
      "2 shape-matched bloc(s) are UK Commons vacancy anchors"
    );
  });

  it("re-checks anchors in apply so a row anchored after planning survives", async () => {
    const orphanNowAnchored = bloc();
    const genuineOrphan = bloc({ state: "NEE", seatsHeld: 14 });
    const db = world({ officials: [orphanNowAnchored, genuineOrphan] });

    // Both look like orphans at plan time.
    const healPlan: HealPlan = await defect.plan(db, ctx);
    expect(healPlan.affected).toBe(2);

    // A by-election is scheduled against one of them before apply runs.
    db.seed("ukCommonsVacancies", [vacancy(orphanNowAnchored._id, "scheduled")]);

    const result = await defect.apply(db, healPlan, ctx);

    expect(result.documentsDeleted).toBe(1);
    expect(db.collection("electedOfficials").docs.map((doc) => String(doc._id))).toEqual([
      String(orphanNowAnchored._id),
    ]);
  });

  it("verifies clean while the only shape-matched rows are anchors", async () => {
    const anchor = bloc();
    const db = world({
      officials: [anchor],
      vacancies: [vacancy(anchor._id, "scheduled")],
    });

    const verified = await defect.verify(db, ctx);

    expect(verified.ok).toBe(true);
    expect(verified.remaining).toBe(0);
    expect(verified.notes.join(" ")).toContain("1 UK Commons vacancy anchor(s) remain, by design");
  });
});
