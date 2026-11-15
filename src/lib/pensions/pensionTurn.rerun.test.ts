/**
 * A process death at any write boundary of the pension phase (contributions and
 * top-ups, benefits, fund investing), then a rerun of the same turn, lands the same
 * employer cash, scheme balances and fund holdings as an uninterrupted turn. Sweeps
 * every write call, before and after it applies.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { runPensionTurn } from "./pensionTurn";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/financialTxLog/emit", () => ({
  emitTx: vi.fn(async (db: Db, row: Record<string, unknown>) => {
    await db.collection("financialTxLog").insertOne({ ...row });
  }),
}));

const TURN = 700;
const UNION = new ObjectId();
const EMPLOYER = new ObjectId();
const SECTOR = new ObjectId();
const SCHEME = new ObjectId();
const FUND = new ObjectId();
const AGREEMENT = new ObjectId();

function world(): InMemoryDb {
  const db = createInMemoryDb();
  db.seed("gameConfig", [{ _id: "default", indexFundsMode: "partial" }]);
  db.seed("exchangeRates", [{ _id: "USD", currencyCode: "USD", rate: 1 }]);
  db.seed("unions", [{ _id: UNION, name: "Test Workers", countryId: "US" }]);
  db.seed("corporations", [
    {
      _id: EMPLOYER,
      name: "Employer",
      countryId: "US",
      liquidCurrencyCode: "USD",
      liquidCapital: 5_000_000,
    },
  ]);
  db.seed("corporateSectors", [{ _id: SECTOR, laborCost: 24_000 * 48 }]);
  db.seed("collectiveAgreements", [
    {
      _id: AGREEMENT,
      unionId: UNION,
      employerCorporationId: EMPLOYER,
      sectorIds: [SECTOR],
      status: "active",
      startsAtTurn: 1,
      expiresAtTurn: 10_000,
      pensionContributionRate: 0.1,
    },
  ]);
  db.seed("pensionSchemes", [
    {
      _id: SCHEME,
      unionId: UNION,
      countryId: "US",
      unionName: "Test Workers",
      assetsAnchor: 2_000_000,
      liabilitiesAnchor: 3_000_000,
      benefitsInPaymentAnchor: 100_000,
      totalContributionsAnchor: 0,
      totalTopUpsAnchor: 0,
      createdAtTurn: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  db.seed("indexFunds", [
    {
      _id: FUND,
      slug: "us-broad",
      name: "US Broad Index",
      scope: "country",
      kind: "broad",
      countryId: "US",
      anchorCurrencyCode: "USD",
      status: "active",
      quotedNav: 100,
      unitSupply: 1000,
      cashAnchor: 100_000,
    },
  ]);
  return db;
}

const VOLATILE = new Set(["updatedAt", "createdAt"]);

function strip(docs: Record<string, unknown>[]) {
  return docs.map((d) => {
    const copy = JSON.parse(JSON.stringify(d, (k, v) => (VOLATILE.has(k) ? undefined : v)));
    // Rows created during the turn get a random id.
    if (copy.holderKind) delete copy._id;
    return copy;
  });
}

function endState(db: InMemoryDb) {
  return {
    corporations: strip(db.collection("corporations").docs),
    pensionSchemes: strip(db.collection("pensionSchemes").docs),
    indexFunds: strip(db.collection("indexFunds").docs),
    indexFundPositions: strip(db.collection("indexFundPositions").docs),
    indexFundTransactions: db.collection("indexFundTransactions").docs.length,
  };
}

/** Rows written after the money moved. A death can leave them short, a rerun must not double them. */
function ledgerRows(db: InMemoryDb) {
  return db.collection("financialTxLog").docs.length;
}

/** Once the injected crash fires the process is dead: every later call fails, nothing is swallowed into a result. */
function mortal(crash: ReturnType<typeof withInjectedCrash>) {
  const state = { dead: false };
  const guard = (target: object): object =>
    new Proxy(target, {
      get(obj, prop, receiver) {
        const value = Reflect.get(obj, prop, receiver);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          if (state.dead) throw new Error("process is dead");
          const out = (value as (...a: unknown[]) => unknown).apply(obj, args);
          if (out && typeof (out as Promise<unknown>).then === "function") {
            return (out as Promise<unknown>).catch((error: unknown) => {
              if (error instanceof Error && error.name === "InjectedCrash") state.dead = true;
              throw error;
            });
          }
          return out;
        };
      },
    });
  const db = { collection: (name: string) => guard(crash.db.collection(name)) } as unknown as Db;
  return { db, state };
}

describe("runPensionTurn rerun safety (stage 2)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("moves money in this world (contributions, benefits and an investment)", async () => {
    const db = world();
    vi.mocked((await import("@/lib/mongodb")).getDb).mockResolvedValue(db as unknown as Db);
    const result = await runPensionTurn(db as unknown as Db, TURN, true);
    expect(result.contributionsAnchor).toBeGreaterThan(0);
    expect(result.benefits.benefitsPaidAnchor).toBeGreaterThan(0);
    expect(result.investing.investedAnchor).toBeGreaterThan(0);
    expect(result.errors).toEqual([]);
  });

  it("applying the phase twice for the same turn equals applying it once", async () => {
    const once = world();
    await runPensionTurn(once as unknown as Db, TURN, true);
    const twice = world();
    await runPensionTurn(twice as unknown as Db, TURN, true);
    await runPensionTurn(twice as unknown as Db, TURN, true);
    expect(endState(twice)).toEqual(endState(once));
    expect(ledgerRows(twice)).toBe(ledgerRows(once));
  });

  it("a death at any write boundary then a rerun equals an uninterrupted turn", async () => {
    const clean = world();
    await runPensionTurn(clean as unknown as Db, TURN, true);
    const expected = endState(clean);
    const expectedRows = ledgerRows(clean);

    let boundaries = 0;
    for (const afterWrite of [false, true]) {
      for (let onCall = 1; onCall <= 120; onCall++) {
        const db = world();
        const mortalDb = mortal(withInjectedCrash(db, { onCall, afterWrite }));
        try {
          await runPensionTurn(mortalDb.db, TURN, true);
        } catch {
          // the process died mid-phase
        }
        if (!mortalDb.state.dead) break;
        boundaries += 1;
        await runPensionTurn(db as unknown as Db, TURN, true);
        expect(endState(db), `death at write ${onCall} afterWrite=${afterWrite}`).toEqual(expected);
        expect(ledgerRows(db), `ledger rows after death at write ${onCall}`).toBeLessThanOrEqual(
          expectedRows
        );
      }
    }
    expect(boundaries).toBeGreaterThan(8);
  });
});

const PENSION_STAMPS = [
  "agreementChargeTurns",
  "pensionDebitTurns",
  "pendingInvestment",
  "lastInvestedTurn",
  "lastSubscriptionTurn",
  "pensionSubscriptionTurns",
];

describe("runPensionTurn below stage 2", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes no stamp fields and the same money as the stamped path", async () => {
    const plain = world();
    vi.mocked((await import("@/lib/mongodb")).getDb).mockResolvedValue(plain as unknown as Db);
    const plainResult = await runPensionTurn(plain as unknown as Db, TURN);
    const stamped = world();
    const stampedResult = await runPensionTurn(stamped as unknown as Db, TURN, true);

    const text = JSON.stringify(endState(plain));
    for (const key of PENSION_STAMPS) expect(text.includes(key), `${key} written`).toBe(false);
    expect(JSON.stringify(endState(stamped)).includes("agreementChargeTurns")).toBe(true);

    const unstamped = (db: InMemoryDb) =>
      JSON.parse(
        JSON.stringify(endState(db), (k, v) => (PENSION_STAMPS.includes(k) ? undefined : v))
      );
    expect(unstamped(plain)).toEqual(unstamped(stamped));
    expect(plainResult).toEqual(stampedResult);
    expect(plainResult.investing.investedAnchor).toBeGreaterThan(0);
    expect(ledgerRows(plain)).toBe(ledgerRows(stamped));
  });
});
