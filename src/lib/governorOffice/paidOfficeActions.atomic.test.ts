import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { POST as justice } from "@/app/api/country/[code]/scotus/justice/action/route";
import { POST as vp } from "@/app/api/country/[code]/executive/vice-president/action/route";
import { JUSTICE_OPINION_NATIONAL_INFLUENCE_GAIN } from "@/lib/constants/justiceActions";
import { VP_RALLY_INFLUENCE_GAIN } from "@/lib/constants/vicePresidentActions";
const h = vi.hoisted(() => ({
  db: null as Db | null,
  actor: null as ObjectId | null,
  user: null as ObjectId | null,
}));
vi.mock("@/lib/mongodb", () => ({ getDb: async () => h.db }));
vi.mock("@/lib/api/requireAuth", () => ({
  requireAuth: async () => ({
    ok: true,
    user: { userId: h.user!.toString(), character: { _id: h.actor! } },
  }),
}));
beforeEach(() => {
  h.actor = new ObjectId();
  h.user = new ObjectId();
});
it.each(["justice", "vp"] as const)(
  "%s couples its charge and landed effect, and recovers the same reply",
  async (kind) => {
    const f = createTransactionalMemoryDb();
    h.db = f.db;
    f.memory.seed("gameState", [
      { _id: "current", currentTurn: 24, resetWorldId: "synthetic-paid-offices" },
    ]);
    f.memory.seed("characters", [{ _id: h.actor!, nationalInfluence: 0, politicalInfluence: 0 }]);
    const collection = kind === "justice" ? "supremeCourtSeats" : "electedOfficials";
    const field = kind === "justice" ? "justiceActionsRemaining" : "vpActionsRemaining";
    f.memory.seed(collection, [
      {
        _id: new ObjectId(),
        countryId: "US",
        seatNumber: 1,
        justiceCharacterId: h.actor!,
        officeType: "vicePresident",
        characterId: h.actor!,
        justiceActionsRemaining: 1,
        vpActionsRemaining: 1,
        lastJusticeActionResetDay: "synthetic",
        lastVpActionResetDay: "synthetic",
      },
    ]);
    const run = () =>
      (kind === "justice" ? justice : vp)(
        new Request("http://localhost", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "synthetic-office-action",
          },
          body: JSON.stringify(
            kind === "justice"
              ? { seatNumber: 1, actionId: "write_opinion" }
              : { actionId: "rally_base" }
          ),
        }),
        { params: Promise.resolve({ code: "US" }) }
      );
    h.db = withInjectedCrash(f.memory, {
      collection: "characters",
      op: "updateOne",
      onCall: 1,
      afterWrite: true,
    }).db;
    expect((await run()).status).toBe(500);
    expect((await f.db.collection(collection).findOne({}))![field]).toBe(1);
    expect(await f.db.collection("characters").findOne({ _id: h.actor! })).toMatchObject({
      nationalInfluence: 0,
      politicalInfluence: 0,
    });
    h.db = f.db;
    const responses = await Promise.all([run(), run()]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(await responses[0].json()).toEqual(await responses[1].json());
    expect((await f.db.collection(collection).findOne({}))![field]).toBe(0);
    const effect = kind === "justice" ? "nationalInfluence" : "politicalInfluence";
    expect((await f.db.collection("characters").findOne({ _id: h.actor! }))![effect]).toBe(
      kind === "justice" ? JUSTICE_OPINION_NATIONAL_INFLUENCE_GAIN : VP_RALLY_INFLUENCE_GAIN
    );
  }
);
