import { describe, expect, it } from "vitest";
import { isSystemMoneyMirrorRelevant, shouldMirrorMoneyAudit } from "./moneyMirrorPolicy";

/**
 * The audit mirror used to be a second write of every money leg: ~54,000
 * inserts per turn into a fifteen-index collection, of which nearly all were
 * system settlements the anomaly scan excludes. These cases pin the narrowed
 * rule so a future detector that needs a system row has to add it here.
 */
describe("isSystemMoneyMirrorRelevant", () => {
  it("keeps supply-agreement settlements, which the related-party check reads", () => {
    expect(isSystemMoneyMirrorRelevant({ action: "corp.supply_agreement" })).toBe(true);
  });

  it("keeps party funding, which the pre-election check reads", () => {
    expect(isSystemMoneyMirrorRelevant({ action: "party.transfer" })).toBe(true);
    expect(isSystemMoneyMirrorRelevant({ action: "party.dues_received" })).toBe(true);
    expect(isSystemMoneyMirrorRelevant({ action: "party.caucus_tax" })).toBe(true);
  });

  it("keeps any row paid to a party, whatever the action", () => {
    expect(isSystemMoneyMirrorRelevant({ action: "corp.revenue", counterpartyType: "party" })).toBe(
      true
    );
  });

  it("drops routine system settlements no detector reads", () => {
    for (const action of [
      "bond.coupon",
      "corp.dividends",
      "corp.revenue",
      "fund.dividend",
      "corp.salary",
      "gov.tax_revenue",
    ]) {
      expect(isSystemMoneyMirrorRelevant({ action })).toBe(false);
    }
  });
});

describe("shouldMirrorMoneyAudit", () => {
  it("mirrors player, NPP and admin actions in full", () => {
    for (const actorKind of ["player", "npp", "admin"]) {
      expect(shouldMirrorMoneyAudit({ candidate: { action: "corp.dividends" }, actorKind })).toBe(
        true
      );
    }
  });

  it("drops a routine system settlement", () => {
    expect(
      shouldMirrorMoneyAudit({ candidate: { action: "bond.coupon" }, actorKind: "system" })
    ).toBe(false);
  });

  it("keeps an unknown actor rather than dropping a route that forgot its context", () => {
    expect(shouldMirrorMoneyAudit({ candidate: { action: "bond.coupon" } })).toBe(true);
    expect(shouldMirrorMoneyAudit({ candidate: { action: "corp.supply_agreement" } })).toBe(true);
  });

  it("restores the full mirror for a forensic investigation", () => {
    expect(
      shouldMirrorMoneyAudit({
        candidate: { action: "bond.coupon" },
        actorKind: "system",
        fullSystemMoneyMirror: true,
      })
    ).toBe(true);
  });
});
