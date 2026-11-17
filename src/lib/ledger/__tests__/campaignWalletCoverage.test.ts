import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { deriveLedgerEntry, reasonForTxType, type DerivableTx } from "@/lib/ledger/deriveFromTx";
import { isRealAccount } from "@/lib/ledger/accounts";
import { BALANCE_SNAPSHOTS_COLLECTION, writeBalanceSnapshot } from "@/lib/ledger/balanceSnapshot";
import { emitStartingCapital } from "@/lib/financialTxLog/startingCapital";
import { emitTx } from "@/lib/financialTxLog/emit";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn(async () => "applied") }));

function tx(overrides: Partial<DerivableTx>): DerivableTx {
  return {
    type: "office_income",
    turn: 5,
    createdAt: new Date("2026-11-01T00:00:00Z"),
    subjectType: "character",
    subjectId: new ObjectId(),
    amount: 1000,
    currencyCode: "USD",
    anchorAmount: 1000,
    ...overrides,
  };
}

describe("campaign wallet coverage", () => {
  it.each(["office_income", "onboarding_reward"] as const)(
    "books %s against the character's campaign wallet",
    (type) => {
      const row = tx({ type });
      const entry = deriveLedgerEntry(row)!;
      expect(entry.legs[0].account).toBe(`character_campaign:${row.subjectId}:USD`);
      expect(isRealAccount(entry.legs[0].account)).toBe(true);
    }
  );

  it("books both sides of a campaign donation against campaign wallets", () => {
    const donor = new ObjectId();
    const target = new ObjectId();
    const entry = deriveLedgerEntry(
      tx({
        type: "campaign_donation",
        subjectId: donor,
        amount: -500,
        anchorAmount: -500,
        counterpartyType: "character",
        counterpartyId: target,
      })
    )!;
    expect(entry.legs[0].account).toBe(`character_campaign:${donor}:USD`);
    expect(entry.legs[1].account).toBe(`character_campaign:${target}:USD`);
  });

  it("leaves personal-wallet rows on the personal account", () => {
    const row = tx({ type: "wire_transfer_in" });
    expect(deriveLedgerEntry(row)!.legs[0].account).toBe(`character:${row.subjectId}:USD`);
  });

  it("books fundraising to the election campaign's funds, not a character wallet", () => {
    const campaignId = new ObjectId().toString();
    const entry = deriveLedgerEntry(tx({ type: "fundraise_credit", meta: { campaignId } }))!;
    expect(entry.legs[0].account).toBe(`campaign_fund:${campaignId}:USD`);
    expect(isRealAccount(entry.legs[0].account)).toBe(false);
    expect(entry.legs[1].account).toBe("mint:political_fundraising:USD");
  });

  it("mints a starting capital row into the matching wallet account", () => {
    const personal = deriveLedgerEntry(
      tx({ type: "starting_capital", meta: { wallet: "personal" } })
    )!;
    const campaign = deriveLedgerEntry(
      tx({ type: "starting_capital", meta: { wallet: "campaign" } })
    )!;
    expect(personal.legs[0].account).toMatch(/^character:/);
    expect(campaign.legs[0].account).toMatch(/^character_campaign:/);
    expect(personal.legs[1].account).toBe("mint:starting_capital:USD");
    expect(campaign.legs[1].account).toBe("mint:starting_capital:USD");
  });
});

describe("previously unattributed tx types", () => {
  it.each([
    ["bond_issuance", "bond_principal_investment"],
    ["savings_deposit", "savings_account_transfer"],
    ["savings_withdrawal", "savings_account_transfer"],
    ["forex_trade", "forex_conversion"],
    ["ipo_proceeds", "equity_issuance_proceeds"],
    ["starting_capital", "starting_capital"],
  ] as const)("%s has the named reason %s", (type, reason) => {
    expect(reasonForTxType(type)).toBe(reason);
    expect(reasonForTxType(type)).not.toBe("unattributed");
  });

  it("nets a deposit against a withdrawal under one reason", () => {
    const deposit = deriveLedgerEntry(
      tx({ type: "savings_deposit", amount: 300, anchorAmount: 300 })
    )!;
    const withdrawal = deriveLedgerEntry(
      tx({ type: "savings_withdrawal", amount: -300, anchorAmount: -300 })
    )!;
    expect(deposit.legs[1].account).toBe("mint:savings_account_transfer:USD");
    expect(withdrawal.legs[1].account).toBe("sink:savings_account_transfer:USD");
  });
});

describe("snapshot coverage", () => {
  async function snapshot(seed: (db: ReturnType<typeof createInMemoryDb>) => void) {
    const memory = createInMemoryDb();
    seed(memory);
    await writeBalanceSnapshot(memory as unknown as Db, 9);
    const stored = await memory.collection(BALANCE_SNAPSHOTS_COLLECTION).findOne({ turn: 9 });
    return stored?.balances as Record<string, number>;
  }

  it("projects the campaign wallet under its own account, apart from personal cash", async () => {
    const id = new ObjectId();
    const balances = await snapshot((db) => {
      db.seed("exchangeRates", [{ _id: "US", currencyCode: "USD", rate: 1 }]);
      db.seed("characters", [
        {
          _id: id,
          countryId: "US",
          currencyBalances: { personal: { USD: 250 }, campaign: 4000 },
        },
      ]);
    });
    expect(balances[`character:${id}:USD`]).toBe(250);
    expect(balances[`character_campaign:${id}:USD`]).toBe(4000);
  });

  it("converts the campaign wallet at the live rate of its home currency", async () => {
    const id = new ObjectId();
    const balances = await snapshot((db) => {
      db.seed("exchangeRates", [{ _id: "UK", currencyCode: "GBP", rate: 2 }]);
      db.seed("characters", [{ _id: id, countryId: "UK", currencyBalances: { campaign: 1000 } }]);
    });
    expect(balances[`character_campaign:${id}:GBP`]).toBe(500);
  });

  it("values an ITL household wallet at the authored rate the settlement legs use", async () => {
    const walletId = JSON.stringify(["epoch-1", "households", "IT", "IT_NW", "ITL"]);
    const balances = await snapshot((db) => {
      db.seed("gameState", [{ _id: "current", worldEpochId: "epoch-1", preset: "2027-default" }]);
      db.seed("exchangeRates", [{ _id: "US", currencyCode: "USD", rate: 1 }]);
      db.seed("producerEconomyAccounts", [
        { _id: walletId, worldEpoch: "epoch-1", currency: "ITL", cash: 54_946 },
      ]);
    });
    expect(balances[`economy_wallet:${walletId}:ITL`]).toBeCloseTo(54_946 / 833, 4);
  });

  it("prefers a live rate over the authored one", async () => {
    const walletId = JSON.stringify(["epoch-1", "households", "FR", "FR_IDF", "FRF"]);
    const balances = await snapshot((db) => {
      db.seed("gameState", [{ _id: "current", worldEpochId: "epoch-1", preset: "2027-default" }]);
      db.seed("exchangeRates", [{ _id: "FR", currencyCode: "FRF", rate: 6 }]);
      db.seed("producerEconomyAccounts", [
        { _id: walletId, worldEpoch: "epoch-1", currency: "FRF", cash: 600 },
      ]);
    });
    expect(balances[`economy_wallet:${walletId}:FRF`]).toBe(100);
  });
});

describe("emitStartingCapital", () => {
  beforeEach(() => vi.mocked(emitTx).mockClear());

  it("witnesses exactly the endowment written onto the character", async () => {
    const characterId = new ObjectId();
    await emitStartingCapital({} as Db, {
      characterId,
      characterName: "Test",
      turn: 4,
      personalCurrency: "EUR",
      campaignCurrency: "FRF",
      endowment: { personal: { EUR: 120_000 }, campaign: 5_000_000 },
    });
    const rows = vi.mocked(emitTx).mock.calls.map((c) => c[1]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      type: "starting_capital",
      subjectId: characterId,
      amount: 120_000,
      currencyCode: "EUR",
      meta: { wallet: "personal" },
    });
    expect(rows[1]).toMatchObject({
      type: "starting_capital",
      amount: 5_000_000,
      currencyCode: "FRF",
      meta: { wallet: "campaign" },
    });
  });

  it("emits nothing for a zero or absent endowment", async () => {
    await emitStartingCapital({} as Db, {
      characterId: new ObjectId(),
      characterName: "Test",
      turn: 4,
      personalCurrency: "USD",
      campaignCurrency: "USD",
      endowment: { personal: { USD: 0 } },
    });
    await emitStartingCapital({} as Db, {
      characterId: new ObjectId(),
      characterName: "Test",
      turn: 4,
      personalCurrency: "USD",
      campaignCurrency: "USD",
      endowment: undefined,
    });
    expect(emitTx).not.toHaveBeenCalled();
  });
});
