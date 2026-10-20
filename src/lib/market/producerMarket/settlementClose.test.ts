import { describe, expect, it, vi } from "vitest";
import { applySettlementClose, type EconomyResult } from "./settlement";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const market = {
  accounts: [
    { id: "corp", cash: 100 },
    { id: "home", cash: 10 },
    { id: "pub", cash: 30 },
  ],
} as unknown as EconomyResult;
const bound = new Set(["corp", "home", "pub"]);

describe("closing transfers settled with the market", () => {
  it("moves balances between bound accounts and keeps the total", () => {
    const out = applySettlementClose(
      market,
      {
        transfers: [
          { reason: "ai_dividend", fromAccountId: "corp", toAccountId: "home", amountAnchor: 60 },
          {
            reason: "transition_support",
            fromAccountId: "pub",
            toAccountId: "corp",
            amountAnchor: 30,
          },
        ],
      },
      bound
    );
    const cash = new Map(out.accounts.map((a) => [a.id, a.cash]));
    expect(cash.get("corp")).toBe(70);
    expect(cash.get("home")).toBe(70);
    expect(cash.get("pub")).toBe(0);
    expect(out.close?.transfers).toHaveLength(2);
  });

  it("refuses unbound accounts and overdrafts", () => {
    expect(() =>
      applySettlementClose(
        market,
        {
          transfers: [
            { reason: "x", fromAccountId: "corp", toAccountId: "nobody", amountAnchor: 1 },
          ],
        },
        bound
      )
    ).toThrow(/unbound/);
    expect(() =>
      applySettlementClose(
        market,
        {
          transfers: [{ reason: "x", fromAccountId: "pub", toAccountId: "corp", amountAnchor: 31 }],
        },
        bound
      )
    ).toThrow(/overdraw/);
  });
});
