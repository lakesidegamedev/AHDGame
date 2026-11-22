import { describe, expect, it } from "vitest";
import { ALL_TX_TYPES } from "@/lib/financialTxLog/types-extended";
import { moneyHistoryKind, moneyHistoryWallet, toMoneyHistoryRow, typesForWallet } from "./rules";

const base = {
  turn: 12,
  createdAt: new Date("2026-11-20T10:00:00Z"),
  currencyCode: "USD",
};

describe("money history rules", () => {
  it("labels dividends, salary and office income with their own source", () => {
    expect(moneyHistoryKind("corp_dividend")).toBe("dividend");
    expect(moneyHistoryKind("corp_salary")).toBe("ceo_salary");
    expect(moneyHistoryKind("office_income")).toBe("office_income");
  });

  it("puts campaign credits in the campaign wallet and everything else in personal", () => {
    expect(moneyHistoryWallet("office_income")).toBe("campaign");
    expect(moneyHistoryWallet("corp_dividend")).toBe("personal");
    const campaign = typesForWallet("campaign").$in ?? [];
    const personal = typesForWallet("personal").$nin ?? [];
    expect(personal).toEqual(campaign);
  });

  it("maps every known tx type to some kind without throwing", () => {
    for (const type of ALL_TX_TYPES) expect(typeof moneyHistoryKind(type)).toBe("string");
  });

  it("shows only public counterparty names", () => {
    const corp = toMoneyHistoryRow({
      ...base,
      type: "corp_dividend",
      amount: 10,
      counterpartyType: "corporation",
      counterpartyName: "Acme",
    });
    expect(corp.counterparty).toBe("Acme");
    const gov = toMoneyHistoryRow({
      ...base,
      type: "gov_grant_paid",
      amount: 10,
      counterpartyType: "government",
      counterpartyName: "Treasury",
    });
    expect(gov.counterparty).toBeNull();
    const gone = toMoneyHistoryRow({
      ...base,
      type: "wire_transfer_in",
      amount: 10,
      counterpartyType: "character",
      counterpartyName: "X",
      counterpartyDeletedAt: new Date(),
    });
    expect(gone.counterparty).toBeNull();
  });

  it("returns only player-safe fields", () => {
    const row = toMoneyHistoryRow({
      ...base,
      type: "corp_dividend",
      amount: -5,
      balanceAfter: 100,
      ...({ flagged: true, suspectFlags: [{}], _id: "x", meta: { a: 1 } } as object),
    });
    expect(Object.keys(row).sort()).toEqual(
      [
        "amount",
        "at",
        "balanceAfter",
        "counterparty",
        "currencyCode",
        "kind",
        "turn",
        "wallet",
      ].sort()
    );
    expect(row.balanceAfter).toBe(100);
  });
});
