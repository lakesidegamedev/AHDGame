import { describe, expect, it } from "vitest";
import { distributeProfits, RETAINED_PROFIT_SHARE } from "./profitDistributionRules";

const row = (over: Partial<Parameters<typeof distributeProfits>[0][number]> = {}) => ({
  accountId: "corp-a",
  kind: "ai" as const,
  profit: 100,
  cash: 1000,
  recipientAccountId: "households-us",
  ...over,
});

describe("profit distribution closes the money loop", () => {
  it("an AI company pays profit beyond its retained share to households", () => {
    const [t] = distributeProfits([row()]);
    expect(t).toEqual({
      fromAccountId: "corp-a",
      toAccountId: "households-us",
      amount: 100 * (1 - RETAINED_PROFIT_SHARE),
      reason: "ai_dividend",
    });
  });

  it("a state company remits to its treasury", () => {
    const [t] = distributeProfits([row({ kind: "state", recipientAccountId: "treasury-ru" })]);
    expect(t.reason).toBe("state_remittance");
    expect(t.toAccountId).toBe("treasury-ru");
  });

  it("player companies keep their profit", () => {
    expect(distributeProfits([row({ kind: "player" })])).toEqual([]);
  });

  it("a loss pays nothing and never claws back", () => {
    expect(distributeProfits([row({ profit: -50 })])).toEqual([]);
  });

  it("never pays more than the cash on hand", () => {
    const [t] = distributeProfits([row({ profit: 1000, cash: 30 })]);
    expect(t.amount).toBe(30);
    expect(distributeProfits([row({ cash: -5 })])).toEqual([]);
  });

  it("conserves money: what leaves companies arrives at recipients", () => {
    const ts = distributeProfits([
      row({ accountId: "a", profit: 10 }),
      row({ accountId: "b", profit: 40, kind: "state", recipientAccountId: "treasury" }),
      row({ accountId: "c", kind: "player" }),
    ]);
    const out = ts.reduce((s, t) => s + t.amount, 0);
    expect(out).toBeCloseTo((10 + 40) * (1 - RETAINED_PROFIT_SHARE), 12);
  });

  it("rejects duplicate accounts and self-payment", () => {
    expect(() => distributeProfits([row(), row()])).toThrow();
    expect(() => distributeProfits([row({ recipientAccountId: "corp-a" })])).toThrow();
  });
});
