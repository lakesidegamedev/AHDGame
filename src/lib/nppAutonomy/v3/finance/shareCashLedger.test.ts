import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { collectBalances } from "@/lib/ledger/balanceSnapshot";
import { expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withBondPoolLedgerSnapshot } from "@/lib/bonds/marketPoolLedger";
import type { LedgerEntry } from "@/lib/ledger/types";
import { witnessNppFoundingCash, witnessNppShareCash } from "./shareCashLedger";
import { nppShareCashLegs } from "./rules/shareCashLedger";

function world(turn = 31, enabled = true) {
  const memory = createInMemoryDb();
  memory.seed("gameConfig", [{ _id: "default", ledgerShadow: enabled }]);
  memory.seed("gameState", [{ _id: "current", currentTurn: turn - 1 }]);
  memory.seed("exchangeRates", [
    { _id: "CA", currencyCode: "CAD", rate: 1.25 },
    { _id: "US", currencyCode: "USD", rate: 0.8 },
  ]);
  return { memory, db: memory as unknown as Db };
}
const now = new Date("2026-11-13T12:00:00Z");
const actor = { _id: new ObjectId(), countryId: "CA" as const };

it("reconciles the Canadian 7,500-anchor corporation-founding fee", async () => {
  const { memory, db } = world(44);
  memory.seed("npps", [{ ...actor, nppInvestmentCashAnchor: 821569.78 }]);
  await withBondPoolLedgerSnapshot(db, 44, async () => {
    await memory
      .collection("npps")
      .updateOne({ _id: actor._id }, { $inc: { nppInvestmentCashAnchor: -7500 } });
    await witnessNppFoundingCash(db, actor, 7500, now);
  });
  expect(memory.collection("npps").docs[0].nppInvestmentCashAnchor).toBeCloseTo(814069.78, 8);
  const entry = memory.collection("ledgerEntries").docs[0] as unknown as LedgerEntry;
  expect(entry).toMatchObject({ turn: 44, txType: "corp_capital_seed", balanced: true });
  expect(entry.legs).toEqual([
    {
      account: `npp:${actor._id}:CAD`,
      amount: -7500,
      currencyCode: "CAD",
      anchorAmount: -7500,
      role: "primary",
    },
    {
      account: "sink:corporation_founding_fee:CAD",
      amount: 7500,
      currencyCode: "CAD",
      anchorAmount: 7500,
      role: "contra",
    },
  ]);
});

it("leaves founding witnesses disabled with the existing shadow flag", async () => {
  const { memory, db } = world(44, false);
  await withBondPoolLedgerSnapshot(db, 44, () => witnessNppFoundingCash(db, actor, 7500, now));
  expect(memory.collection("ledgerEntries").docs).toHaveLength(0);
});

it.each(["USD", "CAD"] as const)(
  "reconciles 100 %s trades with one phase batch",
  async (currency) => {
    const { memory, db } = world();
    const id = new ObjectId();
    memory.seed("npps", [{ _id: id, nppInvestmentCashAnchor: 1000 }]);
    const collection = vi.spyOn(memory, "collection");
    await withBondPoolLedgerSnapshot(db, 31, async () => {
      for (let i = 0; i < 100; i++) {
        await memory
          .collection("npps")
          .updateOne({ _id: id }, { $inc: { nppInvestmentCashAnchor: -0.2934 } });
        await witnessNppShareCash(
          db,
          { _id: id, countryId: currency === "CAD" ? "CA" : "US" },
          -0.2934,
          now
        );
      }
    });
    const names = collection.mock.calls.map(([name]) => name);
    expect(names.filter((name) => name === "gameConfig")).toHaveLength(1);
    expect(names.filter((name) => name === "exchangeRates")).toHaveLength(1);
    expect(names.filter((name) => name === "ledgerEntries")).toHaveLength(1);
    const entries = memory.collection("ledgerEntries").docs as unknown as LedgerEntry[];
    expect(entries).toHaveLength(100);
    const actual = Number(memory.collection("npps").docs[0].nppInvestmentCashAnchor) - 1000;
    const primary = entries.flatMap((e) => e.legs).filter((l) => l.role === "primary");
    expect(primary.every((l) => l.account === `npp:${id}:${currency}`)).toBe(true);
    expect(primary.reduce((sum, l) => sum + l.anchorAmount, 0)).toBeCloseTo(actual, 8);
    expect(actual).toBeCloseTo(-29.34, 8);
    expect(
      entries.every(
        (e) => e.turn === 31 && e.balanced && e.legs.reduce((s, l) => s + l.anchorAmount, 0) === 0
      )
    ).toBe(true);
  }
);

it("flushes completed cash witnesses when a later action fails", async () => {
  const { memory, db } = world();
  await expect(
    withBondPoolLedgerSnapshot(db, 31, async () => {
      await witnessNppShareCash(db, actor, 29.34, now);
      throw new Error("later action failed");
    })
  ).rejects.toThrow("later action failed");
  expect(memory.collection("ledgerEntries").docs).toHaveLength(1);
});

it("retains disabled-ledger behavior", async () => {
  const { memory, db } = world(31, false);
  await withBondPoolLedgerSnapshot(db, 31, () => witnessNppShareCash(db, actor, -29.34, now));
  expect(memory.collection("ledgerEntries").docs).toHaveLength(0);
});

it("keeps nested worlds and their turns separate", async () => {
  const a = world(31),
    b = world(45);
  await withBondPoolLedgerSnapshot(a.db, 31, async () => {
    await witnessNppShareCash(a.db, actor, -29.34, now);
    await withBondPoolLedgerSnapshot(b.db, 45, () =>
      witnessNppShareCash(b.db, { ...actor, countryId: "US" }, 7, now)
    );
    await witnessNppShareCash(a.db, actor, 1, now);
  });
  expect(a.memory.collection("ledgerEntries").docs.map((e) => e.turn)).toEqual([31, 31]);
  expect(b.memory.collection("ledgerEntries").docs.map((e) => e.turn)).toEqual([45]);
});

it("rejects non-finite cash witnesses", () => {
  expect(() => nppShareCashLegs("npp", "CAD", NaN)).toThrow();
});

it("retains the canonical NPP wallet key when modern paper uses another currency", async () => {
  const { memory, db } = world();
  await withBondPoolLedgerSnapshot(db, 31, () =>
    witnessNppShareCash(db, { ...actor, countryId: "FR" }, -29.34, now)
  );
  const entry = memory.collection("ledgerEntries").docs[0] as unknown as LedgerEntry;
  expect(entry.legs[0]).toMatchObject({
    account: `npp:${actor._id}:FRF`,
    amount: -29.34,
    anchorAmount: -29.34,
  });
});

it("matches the actual wallet snapshot account for every configured country", async () => {
  const { memory, db } = world();
  const actors = (Object.keys(COUNTRY_CONFIGS) as CountryId[]).map((countryId) => ({
    _id: new ObjectId(),
    countryId,
    nppInvestmentCashAnchor: 1000,
  }));
  memory.seed("npps", actors);
  const balances = await collectBalances(db);
  await withBondPoolLedgerSnapshot(db, 31, async () => {
    for (const actor of actors) await witnessNppShareCash(db, actor, -29.34, now);
  });
  const entries = memory.collection("ledgerEntries").docs as unknown as LedgerEntry[];
  expect(entries).toHaveLength(actors.length);
  for (const entry of entries)
    for (const leg of entry.legs)
      if (leg.role === "primary") {
        expect(balances).toHaveProperty(leg.account);
      }
});
