/**
 * A wind-up book pays the same money whether it is settled holder by holder or
 * as one bulk write per holder collection (#4571).
 *
 * `payFundHoldersCash` replaced the per-holder settlement that reloaded the
 * fund's exchange rate and wrote a separate credit and receipt for every
 * position. This pins the two paths to the same result: same balances, same
 * receipts, same set of holders left unpaid when a document has vanished.
 */
import { describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { countRoundTrips } from "@/lib/test-utils/roundTripCounter";
import type { IndexFund, IndexFundPosition } from "@/lib/db/types";
import { payFundHolderCash, payFundHoldersCash, type FundHolderCashPayout } from "./holderPayout";

const T0 = new Date("2000-01-01T00:00:00Z");
const TURN = 40;

type Kind = "character" | "imperial_character" | "npp" | "pension_scheme" | "fund_reserve";

function oid(index: number): ObjectId {
  return new ObjectId(`bbbbbbbbbbbbbbbbbbbb${String(index).padStart(4, "0")}`);
}

function world(currency: "USD" | "GBP" = "USD", holderCount = 4) {
  const memory = createInMemoryDb();
  const db = memory as unknown as Db;
  const fund: IndexFund = {
    _id: oid(1),
    slug: "windup-book",
    name: "Wind-Up Book Fund",
    tickerSymbol: "WUB",
    scope: "country",
    kind: "broad",
    countryId: currency === "USD" ? "US" : "UK",
    anchorCurrencyCode: currency,
    status: "winding_down",
    quotedNav: 100,
    unitSupply: 10_000,
    reserveUnits: 0,
    cashAnchor: 100_000,
    targetConstituents: [],
    holdings: [],
    createdAt: T0,
    updatedAt: T0,
  } as IndexFund;

  const positions: IndexFundPosition[] = [];
  const payouts: FundHolderCashPayout[] = [];
  const characters: Record<string, unknown>[] = [];
  const imperialCharacters: Record<string, unknown>[] = [];
  const npps: Record<string, unknown>[] = [];
  const pensionSchemes: Record<string, unknown>[] = [];

  const add = (kind: Kind, index: number, units: number, payoutAnchor: number) => {
    const id = oid(100 + index);
    const base = { _id: id, fundId: fund._id, holderKind: kind, units, updatedAt: T0 };
    if (kind === "character") {
      characters.push({ _id: id, name: `Holder ${index}`, currencyBalances: { personal: {} } });
      positions.push({ ...base, characterId: id } as IndexFundPosition);
    } else if (kind === "imperial_character") {
      imperialCharacters.push({
        _id: id,
        name: `Imperial ${index}`,
        currencyBalances: { personal: {} },
      });
      positions.push({ ...base, imperialCharacterId: id } as IndexFundPosition);
    } else if (kind === "npp") {
      npps.push({ _id: id, countryId: "US", name: `NPP ${index}`, nppInvestmentCashAnchor: 0 });
      positions.push({ ...base, nppId: id } as IndexFundPosition);
    } else if (kind === "pension_scheme") {
      pensionSchemes.push({ _id: id, name: `Pension ${index}`, assetsAnchor: 0 });
      positions.push({ ...base, pensionSchemeId: id } as IndexFundPosition);
    } else {
      positions.push({ ...base, holderKind: "fund_reserve" } as IndexFundPosition);
    }
    payouts.push({ position: positions[positions.length - 1], payoutAnchor });
  };

  const kinds: Kind[] = ["character", "imperial_character", "npp", "pension_scheme"];
  for (let index = 0; index < holderCount; index++)
    add(kinds[index % kinds.length], index, 100, 1_000 + index);
  add("fund_reserve", 900, 500, 5_000);

  memory.seed("characters", characters);
  memory.seed("imperialCharacters", imperialCharacters);
  memory.seed("npps", npps);
  memory.seed("pensionSchemes", pensionSchemes);
  memory.seed("exchangeRates", [
    { currencyCode: "USD", rate: 1 },
    { currencyCode: "GBP", rate: 0.79 },
  ]);
  return { memory, db, fund, positions, payouts };
}

/** Balances and receipts, which are what the two paths must agree on. */
async function settled(w: ReturnType<typeof world>) {
  const rows = [
    ...(await w.db.collection("characters").find({}).sort({ name: 1 }).toArray()),
    ...(await w.db.collection("imperialCharacters").find({}).sort({ name: 1 }).toArray()),
    ...(await w.db.collection("npps").find({}).sort({ name: 1 }).toArray()),
    ...(await w.db.collection("pensionSchemes").find({}).sort({ name: 1 }).toArray()),
  ].map((row) => ({
    name: row.name,
    balances: row.currencyBalances ?? null,
    cashAnchor: row.nppInvestmentCashAnchor ?? null,
    assetsAnchor: row.assetsAnchor ?? null,
  }));
  const receipts = w.memory
    .collection("indexFundTransactions")
    .docs.map((row) => ({
      holderKind: row.holderKind,
      units: row.units,
      amountAnchor: row.amountAnchor,
      characterId: row.characterId ? String(row.characterId) : undefined,
      imperialCharacterId: row.imperialCharacterId ? String(row.imperialCharacterId) : undefined,
      nppId: row.nppId ? String(row.nppId) : undefined,
      pensionSchemeId: row.pensionSchemeId ? String(row.pensionSchemeId) : undefined,
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { rows, receipts };
}

describe("wind-up holder book settlement", () => {
  it("pays the same balances and receipts one by one or as a book", async () => {
    const oneByOne = world();
    for (const { position, payoutAnchor } of oneByOne.payouts)
      await payFundHolderCash(oneByOne.db, oneByOne.fund, position, payoutAnchor, TURN, T0);

    const book = world();
    const result = await payFundHoldersCash(book.db, book.fund, book.payouts, TURN, T0);

    expect(await settled(book)).toEqual(await settled(oneByOne));
    // The reserve is the fund's own units: neither paid nor owed.
    expect(result.paid).toHaveLength(4);
    expect(result.unpaid).toHaveLength(0);
    expect(result.distributedAnchor).toBe(1_000 + 1_001 + 1_002 + 1_003);
  });

  it("converts to the holder currency once for the whole book", async () => {
    const oneByOne = world("GBP");
    for (const { position, payoutAnchor } of oneByOne.payouts)
      await payFundHolderCash(oneByOne.db, oneByOne.fund, position, payoutAnchor, TURN, T0);
    const book = world("GBP");
    await payFundHoldersCash(book.db, book.fund, book.payouts, TURN, T0);
    expect(await settled(book)).toEqual(await settled(oneByOne));
  });

  it("names the holder whose document vanished instead of paying it", async () => {
    const book = world();
    await book.db.collection("characters").deleteOne({ _id: book.payouts[0].position.characterId });
    const result = await payFundHoldersCash(book.db, book.fund, book.payouts, TURN, T0);
    expect(result.unpaid).toEqual([book.payouts[0].position]);
    expect(result.paid).toHaveLength(3);
    expect(book.memory.collection("indexFundTransactions").docs).toHaveLength(3);
  });

  it("costs the same round trips for four holders as for sixty", async () => {
    const small = world("USD", 4);
    const smallTrips = countRoundTrips(small.memory);
    await payFundHoldersCash(small.db, small.fund, small.payouts, TURN, T0);

    const large = world("USD", 60);
    const largeTrips = countRoundTrips(large.memory);
    await payFundHoldersCash(large.db, large.fund, large.payouts, TURN, T0);

    expect(largeTrips.total(), largeTrips.summary()).toBe(smallTrips.total());
    // One rate read, one credit per holder collection, one receipt write.
    expect(largeTrips.total(), largeTrips.summary()).toBeLessThan(12);
  });
});
