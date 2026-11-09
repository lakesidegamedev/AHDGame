import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import {
  applyConfidenceEventToGov,
  getConfidenceGauge,
  resetConfidenceGauge,
  tickConfidenceForGov,
  tickParliamentaryGovernmentConfidence,
} from "@/lib/countries/uk/confidence/confidenceGaugeStore";
import { resetCompletedSnapConfidence } from "@/lib/turn/snapConfidence";
import { governmentConfidenceEnabled } from "./rules/featureGate";
import { isGovernmentConfidenceEnabled } from "./featureFlag";

const now = new Date("2000-01-01T00:00:00Z");
afterEach(() => vi.unstubAllEnvs());
function world(enabled?: boolean, varied = false) {
  const memory = createInMemoryDb();
  if (enabled !== undefined)
    memory.seed("gameConfig", [{ _id: "default", governmentConfidenceEnabled: enabled }]);
  const ids = Object.keys(COUNTRY_CONFIGS) as CountryId[];
  memory.seed(
    "governmentFormations",
    ids.map((countryId, index) => ({
      _id: countryId,
      countryId,
      status: "formed",
      formedTurn: 1,
      confidenceGauge: varied ? [0, 12.5, 50, 95][index % 4] : 0,
      confidenceGaugeHistory: [
        { turn: 10, value: varied ? [0, 12.5, 50, 95][index % 4] : 0, at: now, reason: "turn" },
      ],
    }))
  );
  memory.seed(
    "governmentApprovals",
    ids.map((_id) => ({ _id, approvalRating: 0 }))
  );
  return { memory, db: memory as unknown as Db, ids };
}

describe("Government Confidence freeze", () => {
  it.each([undefined, null, {}, { governmentConfidenceEnabled: false }])(
    "defaults to frozen for %j",
    (config) => {
      expect(governmentConfidenceEnabled(config)).toBe(false);
    }
  );
  it("requires explicit enablement", () =>
    expect(governmentConfidenceEnabled({ governmentConfidenceEnabled: true })).toBe(true));
  it.each([undefined, false])(
    "preserves every country's gauge and history with enabled=%s",
    async (enabled) => {
      vi.stubEnv("UK_CONFIDENCE_GAUGE_DISSOLUTION", "1");
      const { memory, db, ids } = world(enabled, true);
      const before = structuredClone(memory.collection("governmentFormations").docs);
      for (let turn = 11; turn <= 15; turn++) {
        for (const countryId of ids) {
          const value = before.find((row) => row._id === countryId)!.confidenceGauge;
          expect(
            await applyConfidenceEventToGov(db, { kind: "budgetDefeat" }, now, turn, countryId)
          ).toEqual({ value, dissolutionDue: false, dissolutionEnabled: false });
          expect(
            await tickConfidenceForGov(db, {
              approval: 100,
              brokenPromiseMeter: 0,
              now,
              turn,
              countryId,
            })
          ).toEqual({ value, dissolutionDue: false, dissolutionEnabled: false });
          expect(await resetConfidenceGauge(db, now, turn, countryId)).toBe(value);
        }
        expect(
          await tickParliamentaryGovernmentConfidence(db, { countryIds: ids, now, turn })
        ).toEqual([]);
      }
      expect(memory.collection("governmentFormations").docs).toEqual(before);
      expect(memory.collection("gameConfig").docs).toHaveLength(enabled === undefined ? 0 : 1);
    }
  );
  it("checks the global switch once per country batch and skips gauge reads while frozen", async () => {
    const { memory, db, ids } = world(false);
    const configRead = vi.spyOn(memory.collection("gameConfig"), "findOne");
    const governmentRead = vi.spyOn(memory.collection("governmentFormations"), "find");
    const approvalRead = vi.spyOn(memory.collection("governmentApprovals"), "find");
    const writes = vi.spyOn(memory.collection("governmentFormations"), "bulkWrite");
    await tickParliamentaryGovernmentConfidence(db, { countryIds: ids, now, turn: 11 });
    expect(configRead).toHaveBeenCalledExactlyOnceWith(
      { _id: "default" },
      { projection: { governmentConfidenceEnabled: 1 } }
    );
    expect(governmentRead).not.toHaveBeenCalled();
    expect(approvalRead).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
  });

  it("resumes from the stored value without applying missed turns or snap boosts", async () => {
    const { memory, db, ids } = world(false);
    const events = ids.map((countryId) => ({ countryId, startTurn: 5, turn: 15 }));
    await resetCompletedSnapConfidence(db, events, now);
    for (const doc of memory.collection("governmentFormations").docs) {
      expect(doc.confidenceGauge).toBe(0);
      expect(doc.confidenceGaugeHistory).toHaveLength(1);
      expect(doc.confidenceSnapStartTurn).toBe(5);
    }
    await db
      .collection("gameConfig")
      .updateOne({ _id: "default" } as never, { $set: { governmentConfidenceEnabled: true } });
    expect(await isGovernmentConfidenceEnabled(db)).toBe(true);
    await resetCompletedSnapConfidence(db, events, now);
    for (const countryId of ids) {
      expect(await getConfidenceGauge(db, countryId)).toBe(0);
      const result = await tickConfidenceForGov(db, { approval: 100, now, turn: 16, countryId });
      expect(result.value).toBe(5);
    }
    await db
      .collection("gameConfig")
      .updateOne({ _id: "default" } as never, { $set: { governmentConfidenceEnabled: false } });
    expect(await isGovernmentConfidenceEnabled(db)).toBe(false);
    for (const countryId of ids) {
      await applyConfidenceEventToGov(db, { kind: "budgetDefeat" }, now, 17, countryId);
      expect(await getConfidenceGauge(db, countryId)).toBe(5);
    }
  });
});
