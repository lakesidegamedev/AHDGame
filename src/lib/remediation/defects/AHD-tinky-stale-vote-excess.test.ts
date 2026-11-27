import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import type { HealContext, HealPlan } from "../types";
vi.mock("@/lib/financialTxLog/emit", () => ({
  loadTxThresholds: async () => ({}),
  emitTxBulk: async () => {},
}));
import { CLAIMS, DEFECT_ID, defect, totalClaimAnchor } from "./AHD-tinky-stale-vote-excess";

describe("AHD Tinky stale-vote excess plan", () => {
  it("pins the owner-approved direct-loss heal to the seven material claims", () => {
    expect(CLAIMS).toHaveLength(7);
    expect(totalClaimAnchor()).toBe(1_541_456_779.26);

    const directRestitution = CLAIMS.filter((claim) => claim.destination === "character").reduce(
      (sum, claim) => sum + claim.anchorAmount,
      0
    );
    const participantExcess = CLAIMS.filter(
      (claim) => claim.reason === "participant_excess"
    ).reduce((sum, claim) => sum + claim.anchorAmount, 0);
    const unclaimed = CLAIMS.filter((claim) => claim.reason === "deleted_claimant").reduce(
      (sum, claim) => sum + claim.anchorAmount,
      0
    );

    expect(directRestitution).toBeCloseTo(2_969_972.56, 2);
    expect(participantExcess).toBeCloseTo(184_445_778.75, 2);
    expect(unclaimed).toBeCloseTo(1_354_041_027.95, 2);
    expect(directRestitution + participantExcess + unclaimed).toBeCloseTo(totalClaimAnchor(), 2);
  });

  it("is a money-conserving, production-only, idempotent heal", () => {
    expect(defect.id).toBe(DEFECT_ID);
    expect(defect.envs).toEqual(["prod"]);
    expect(defect.idempotent).toBe(true);
    expect(defect.mintsMoney).not.toBe(true);
    expect(defect.guards).toContain("money-conserving");
    expect(defect.guards).toContain("turn-lock-free");
  });
});

describe("stale-vote restitution cash conservation", () => {
  function fixture(issuerCash = 100) {
    const { db, memory } = createTransactionalMemoryDb();
    const issuer = new ObjectId(),
      recipient = new ObjectId();
    memory.seed("corporations", [
      { _id: issuer, liquidCapital: issuerCash, shareIssuanceProceeds: 100 },
    ]);
    memory.seed("characters", [{ _id: recipient, currencyBalances: { personal: { USD: 0 } } }]);
    const plan: HealPlan = {
      affected: 1,
      touched: [],
      moneyDelta: 0,
      summary: "fixture",
      payload: {
        corporationId: issuer.toString(),
        corporationName: "fixture",
        corporationCurrencyCode: "USD",
        corporationFxRate: 1,
        debitAnchor: 100,
        debitLocal: 100,
        sourceTradeIds: [],
        characterCredits: [
          {
            claimId: "fixture",
            characterId: recipient.toString(),
            characterName: "fixture",
            currencyCode: "USD",
            fxRate: 1,
            anchorAmount: 100,
            localAmount: 100,
          },
        ],
        treasuryCredits: [],
      },
    };
    const context: HealContext = { env: "prod", dryRun: false, now: new Date(), runId: "fixture" };
    return { db, memory, issuer, recipient, plan, context };
  }

  it("rolls back credits when the issuer cannot pay, then retries exactly once", async () => {
    const f = fixture(0);
    await expect(defect.apply(f.db, f.plan, f.context)).rejects.toThrow("issuer balance");
    const character = () => f.db.collection("characters").findOne({ _id: f.recipient });
    expect((await character())?.currencyBalances.personal.USD).toBe(0);
    await f.db
      .collection("corporations")
      .updateOne({ _id: f.issuer }, { $set: { liquidCapital: 100 } });
    await defect.apply(f.db, f.plan, f.context);
    await defect.apply(f.db, f.plan, f.context);
    expect((await character())?.currencyBalances.personal.USD).toBe(100);
    expect((await f.db.collection("corporations").findOne({ _id: f.issuer }))?.liquidCapital).toBe(
      0
    );
  });

  it("resumes a previously credited prefix without paying that recipient again", async () => {
    const f = fixture();
    await f.db.collection("characters").updateOne(
      { _id: f.recipient },
      {
        $set: {
          "currencyBalances.personal.USD": 100,
          [`remediation.${DEFECT_ID}`]: { claimId: "fixture", creditAnchor: 100 },
        },
      }
    );
    await Promise.all([
      defect.apply(f.db, f.plan, f.context),
      defect.apply(f.db, f.plan, f.context),
    ]);
    expect(
      (await f.db.collection("characters").findOne({ _id: f.recipient }))?.currencyBalances.personal
        .USD
    ).toBe(100);
    expect((await f.db.collection("corporations").findOne({ _id: f.issuer }))?.liquidCapital).toBe(
      0
    );
  });

  it("refuses a stale denomination without crediting any recipient", async () => {
    const f = fixture();
    await f.db
      .collection("corporations")
      .updateOne({ _id: f.issuer }, { $set: { liquidCurrencyCode: "CAD" } });
    await expect(defect.apply(f.db, f.plan, f.context)).rejects.toThrow("issuer balance");
    expect(
      (await f.db.collection("characters").findOne({ _id: f.recipient }))?.currencyBalances.personal
        .USD
    ).toBe(0);
    expect((await f.db.collection("corporations").findOne({ _id: f.issuer }))?.liquidCapital).toBe(
      100
    );
  });
});
