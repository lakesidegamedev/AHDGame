/** Stateful, synthetic settlement simulations. No live database or player records. */
import { afterAll, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { writeFileSync } from "node:fs";
import { createInMemoryDb } from "../../src/lib/test-utils/inMemoryDb";
import { withInjectedCrash } from "../../src/lib/test-utils/faultyDb";
import { creditIncomeAfterTax, type IncomeCredit } from "../../src/lib/budget/incomePayout";
import { settleCorporateTaxPriority } from "../../src/lib/turn/corporation/corporateTaxPriority";
import { creditCorpDividends } from "../../src/lib/turn/corporation/corporationTurnPhases";
import type { CorpSnapshot } from "../../src/lib/turn/corporation/types";
import {
  atomicallyDebitCorpLiquidCapital,
  debitCorpShareEscrowCapped,
  debitCorpShareEscrowFloored,
} from "../../src/lib/financialTxLog/atomicCashGuard";
import { corporateDiscretionaryCashGuard } from "../../src/lib/corporations/rules/discretionaryCash";

function clone<T>(value: T): T {
  if (value instanceof ObjectId) return new ObjectId(value.toHexString()) as T;
  if (value instanceof Date) return new Date(value) as T;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
  return value;
}
const transaction = vi.hoisted(() => ({ begin: () => () => {} }));
vi.mock("../../src/lib/db/runRequiredTransaction", () => ({
  runRequiredTransaction: async (body: (session: object) => unknown) => {
    const undo = transaction.begin();
    try {
      return await body({});
    } catch (error) {
      undo();
      throw error;
    }
  },
}));
vi.mock("../../src/lib/mongodb", () => ({ getDb: vi.fn() }));
const now = new Date("2026-10-31T12:00:00Z");
const countries = [
  { country: "US", currency: "USD", fx: 1 },
  { country: "UK", currency: "GBP", fx: 0.8 },
  { country: "JP", currency: "JPY", fx: 150 },
] as const;
type Country = (typeof countries)[number];
const scenarios = [
  "no arrears",
  "small arrears",
  "partial arrears",
  "zero tax rate",
  "foreign currency crash and replay",
] as const;
const output: Record<string, unknown>[] = [];
function memoryWorld(home: Country, zeroRate = false) {
  const memory = createInMemoryDb();
  transaction.begin = () => {
    const saved = new Map(
      [...memory.collections].map(([name, collection]) => [name, clone(collection.docs)])
    );
    return () => {
      for (const [name, collection] of memory.collections)
        collection.docs = clone(saved.get(name) ?? []);
    };
  };
  memory.seed("gameState", [
    {
      _id: "current",
      resetWorldId: "synthetic",
      forexEnabled: true,
      preset: "2019-default",
      currentTurn: 2,
    },
  ]);
  memory.seed("gameConfig", [
    { _id: "default", treasuryCashLedgerEnabled: true, ledgerShadow: true },
  ]);
  memory.seed(
    "exchangeRates",
    countries.map((row) => ({ _id: row.currency, currencyCode: row.currency, rate: row.fx }))
  );
  const budgetId = home.country === "US" ? "federal" : home.country;
  const rates = (national: boolean) => ({
    incomeTax: zeroRate ? 0 : national ? 20 : 10,
    capitalGainsTaxLow: zeroRate ? 0 : national ? 15 : 5,
    capitalGainsTaxMiddle: zeroRate ? 0 : national ? 15 : 5,
    capitalGainsTaxHigh: zeroRate ? 0 : national ? 15 : 5,
  });
  memory.seed("federalBudget", [
    {
      _id: budgetId,
      countryId: home.country,
      currencyCode: home.currency,
      taxRates: rates(true),
      treasuryCashLocal: 0,
      treasuryBalance: 0,
    },
  ]);
  memory.seed("stateBudgets", [
    {
      _id: "REGION",
      countryId: home.country,
      currencyCode: home.currency,
      taxRates: rates(false),
      balance: 0,
    },
  ]);
  memory.seed("macroMetrics", [
    { _id: "REGION", economic: { medianIncome: { value: 100 * home.fx } } },
  ]);
  return { memory, db: memory as unknown as Db, budgetId };
}
function digest(memory: ReturnType<typeof createInMemoryDb>) {
  // Financial reporting is outside these source settlement receipts. Monetary
  // state, tax assessments, interest projections and recovery receipts are included.
  return JSON.stringify(
    [...memory.collections]
      .filter(([name, col]) => col.docs.length && name !== "financialTxLog")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, col]) => [name, col.docs])
  );
}
async function assertLedger(db: Db) {
  for (const entry of await db.collection("ledgerEntries").find({}).toArray()) {
    const legs = entry.legs as Array<{ anchorAmount: number }>;
    expect(legs.reduce((sum, leg) => sum + leg.anchorAmount, 0)).toBeCloseTo(0, 7);
  }
}
const personal = [
  "CEO salary",
  "corporation dividend",
  "already-taxed pass-through dividend",
  "capital-gains dividend",
  "index-fund dividend",
  "bond coupon",
  "bond principal",
  "bond coupon plus principal",
  "central-bank authoritative interest",
  "central-bank legacy interest",
  "private-bank authoritative interest",
  "private-bank legacy interest",
] as const;

describe("personal source transaction matrix", () => {
  for (const kind of personal)
    for (const home of countries)
      for (const [index, scenario] of scenarios.entries()) {
        it(`${kind}: ${home.country}: ${scenario}`, async () => {
          const f = memoryWorld(home, index === 3);
          const source =
            index === 4
              ? countries.find((row) => row.currency !== home.currency && row.country !== "UK")!
              : home;
          const fx = source.fx;
          const id = new ObjectId(),
            payer = new ObjectId();
          const debtAnchor = [0, 20, 200, 50, 50][index];
          const savings = kind.includes("interest");
          const authoritative = kind.includes("authoritative");
          const privateBank = kind.startsWith("private-bank");
          const protectedPrincipal =
            kind === "bond principal" ? 100 : kind === "bond coupon plus principal" ? 1000 : 0;
          const earnings = kind === "bond principal" ? 0 : 100;
          const gross = (earnings + protectedPrincipal) * fx;
          const exempt = kind === "already-taxed pass-through dividend";
          const capital = kind === "capital-gains dividend";
          const balances = Object.fromEntries(
            countries.map((row) => [
              row.currency,
              row.currency === source.currency && savings ? 1000 * fx : 0,
            ])
          );
          f.memory.seed("characters", [
            {
              _id: id,
              name: "Synthetic recipient",
              countryId: home.country,
              homeState: "REGION",
              incomeTaxStartTurn: 1,
              incomeTier: "high",
              currencyBalances: {
                personal: { USD: 0, GBP: 0, JPY: 0 },
                savings: balances,
                pendingSavingsInterest: {
                  [source.currency]: savings && authoritative && !privateBank ? gross : 0,
                },
              },
            },
          ]);
          f.memory.seed(
            "playerIncomeTaxAssessments",
            debtAnchor
              ? [
                  {
                    _id: "old",
                    characterId: id,
                    ownerCollection: "characters",
                    worldId: "synthetic",
                    turn: 1,
                    name: "Synthetic recipient",
                    tier: "high",
                    currency: home.currency,
                    sourcePath: "currencyBalances.personal." + home.currency,
                    sourceFx: home.fx,
                    walletFx: home.fx,
                    countryId: home.country,
                    nationalBudgetId: f.budgetId,
                    nationalCurrency: home.currency,
                    nationalFx: home.fx,
                    stateId: "REGION",
                    regionalCurrency: home.currency,
                    regionalFx: home.fx,
                    gross: 1000 * home.fx,
                    federal: debtAnchor * 0.8 * home.fx,
                    regional: debtAnchor * 0.2 * home.fx,
                    net: (1000 - debtAnchor) * home.fx,
                    status: "unpaid",
                    createdAt: now,
                  },
                ]
              : []
          );
          f.memory.seed("corporations", [
            {
              _id: payer,
              liquidCapital: 5000 * fx,
              bankCharter: { cashReserves: 5000 * fx, playerDeposits: 1000 * fx },
            },
          ]);
          f.memory.seed("savingsAccounts", [
            {
              _id: new ObjectId(),
              ownerType: "character",
              ownerId: id,
              currency: source.currency,
              status: "active",
              balance: 1000 * fx,
              accruedInterest: savings && authoritative && !privateBank ? gross : 0,
            },
          ]);
          f.memory.seed("centralBanks", [
            { _id: source.country, householdSavingsLiability: 1000 * fx },
          ]);
          // Model the producer's already-funded gross outflow. The authoritative
          // deposit-interest path instead capitalizes a liability and pays only
          // diverted tax/arrears out of bank backing, as in bankingTurn.
          if (!savings || !authoritative) {
            if (privateBank)
              await f.db
                .collection("corporations")
                .updateOne({ _id: payer }, { $inc: { "bankCharter.cashReserves": -gross } });
            else if (!savings)
              expect(
                (
                  await atomicallyDebitCorpLiquidCapital(f.db, payer, gross, {
                    corporateObligation: true,
                  })
                ).ok
              ).toBe(true);
          }
          const credit: IncomeCredit = {
            characterId: id,
            ownerCollection: "characters",
            currency: source.currency,
            gross,
            income: exempt || capital ? 0 : earnings * fx,
            capital: capital ? earnings * fx : 0,
            arrearsExempt: protectedPrincipal * fx,
            destination: `currencyBalances.${savings ? "savings" : "personal"}.${source.currency}`,
            ...(savings
              ? {
                  interest: authoritative
                    ? privateBank
                      ? { authoritative: true, bankId: payer }
                      : {
                          authoritative: true,
                          centralBankId: source.country,
                          pendingPath: "currencyBalances.pendingSavingsInterest." + source.currency,
                        }
                    : {},
                }
              : {}),
          };
          const before = digest(f.memory);
          if (index === 4) {
            const failed = withInjectedCrash(f.memory, {
              collection: "playerIncomeTaxBatches",
              op: "insertOne",
              onCall: 1,
              afterWrite: true,
            });
            await expect(
              creditIncomeAfterTax(failed.db, "matrix:" + kind, 2, now, [credit])
            ).rejects.toThrow();
            expect(digest(f.memory)).toBe(before);
          }
          const [paid] = await creditIncomeAfterTax(f.db, "matrix:" + kind, 2, now, [credit]);
          const taxAnchor = index === 3 || exempt ? 0 : earnings * (capital ? 0.2 : 0.3);
          const arrearsAnchor = Math.min(debtAnchor, Math.max(0, earnings - taxAnchor));
          const netAnchor = earnings + protectedPrincipal - taxAnchor - arrearsAnchor;
          expect(paid.currentTax / fx).toBeCloseTo(taxAnchor, 7);
          expect(paid.arrearsPaid / fx).toBeCloseTo(arrearsAnchor, 7);
          expect(paid.net / fx).toBeCloseTo(netAnchor, 7);
          const actor = await f.db.collection("characters").findOne({ _id: id });
          const wallets = actor!.currencyBalances as Record<string, Record<string, number>>;
          expect(wallets[savings ? "savings" : "personal"][source.currency] / fx).toBeCloseTo(
            (savings ? 1000 : 0) + netAnchor,
            7
          );
          const national = await f.db
            .collection("federalBudget")
            .findOne({ _id: f.budgetId as never });
          const regional = await f.db
            .collection("stateBudgets")
            .findOne({ _id: "REGION" as never });
          const governmentAnchor =
            (Number(national?.treasuryCashLocal) + Number(regional?.balance)) / home.fx;
          expect(governmentAnchor).toBeCloseTo(taxAnchor + arrearsAnchor, 7);
          expect(netAnchor + governmentAnchor).toBeCloseTo(gross / fx, 7);
          if (debtAnchor) {
            const debt = await f.db
              .collection("playerIncomeTaxAssessments")
              .findOne({ _id: "old" as never });
            expect(
              (Number(debt?.collectedFederal ?? 0) + Number(debt?.collectedRegional ?? 0)) / home.fx
            ).toBeCloseTo(arrearsAnchor, 7);
            expect(debt?.status).toBe(arrearsAnchor + 1e-8 >= debtAnchor ? "paid" : "unpaid");
          }
          const bank = await f.db.collection("corporations").findOne({ _id: payer });
          const charter = bank!.bankCharter as { cashReserves: number; playerDeposits: number };
          if (privateBank) {
            expect(charter.cashReserves / fx).toBeCloseTo(
              5000 - (authoritative ? taxAnchor + arrearsAnchor : gross / fx),
              7
            );
            if (authoritative) expect(charter.playerDeposits / fx).toBeCloseTo(1000 + netAnchor, 7);
          } else if (!savings)
            expect(Number(bank?.liquidCapital) / fx).toBeCloseTo(5000 - gross / fx, 7);
          if (authoritative) {
            const account = await f.db.collection("savingsAccounts").findOne({ ownerId: id });
            expect(Number(account?.balance) / fx).toBeCloseTo(1000 + netAnchor, 7);
            if (!privateBank) {
              expect(wallets.pendingSavingsInterest[source.currency]).toBe(0);
              expect(account?.accruedInterest).toBe(0);
              const cb = await f.db
                .collection("centralBanks")
                .findOne({ _id: source.country as never });
              expect(Number(cb?.householdSavingsLiability) / fx).toBeCloseTo(1000 + netAnchor, 7);
            }
          }
          await assertLedger(f.db);
          const once = digest(f.memory);
          await creditIncomeAfterTax(f.db, "matrix:" + kind, 2, now, [credit]);
          expect(digest(f.memory)).toBe(once);
          output.push({
            type: kind,
            country: home.country,
            scenario,
            sourceCurrency: source.currency,
            grossAnchor: gross / fx,
            currentTaxAnchor: paid.currentTax / fx,
            arrearsPaidAnchor: paid.arrearsPaid / fx,
            netPaidAnchor: paid.net / fx,
            debtRemainingAnchor: debtAnchor - arrearsAnchor,
            replay: "unchanged",
            rollback: index === 4 ? "verified" : "not injected",
          });
        });
      }
});

const corporate = [
  "modeled operating earnings",
  "funded operating receipts",
  "corporate dividend receipt",
  "AI household distribution",
  "operating loss",
  "corporate arrears recovery",
] as const;
describe("corporate source transaction matrix", () => {
  for (const kind of corporate)
    for (const home of countries)
      for (const [index, scenario] of scenarios.entries()) {
        it(`${kind}: ${home.country}: ${scenario}`, async () => {
          const f = memoryWorld(home, index === 3);
          const id = new ObjectId();
          const tax = index === 3 ? 0 : 20;
          const oldTax = [0, 20, 200, 50, 50][index];
          const oldOperating = [0, 10, 50, 20, 20][index];
          const loss = kind === "operating loss";
          const funded =
            kind === "funded operating receipts" || kind === "AI household distribution";
          const operatingCurrency =
            index === 4 ? countries.find((row) => row.currency !== home.currency)! : home;
          f.memory.seed("corporations", [
            {
              _id: id,
              name: "Synthetic corporation",
              countryId: home.country,
              liquidCurrencyCode: home.currency,
              liquidCapital: 100 * home.fx,
              pendingOperatingCash: funded ? 100 * home.fx : 0,
              federalTaxArrearsAnchorByCountry: { [home.country]: oldTax },
              operatingCashArrearsByCurrency: {
                [operatingCurrency.currency]: oldOperating * operatingCurrency.fx,
              },
            },
          ]);
          const recipients = [countries[0], countries[1]];
          f.memory.seed(
            "producerEconomyAccounts",
            recipients.map((row, i) => ({
              _id: `household-${i}`,
              worldEpoch: "synthetic",
              currency: row.currency,
              cash: 0,
            }))
          );
          const snapshot = {
            corpId: id,
            operatingCashCurrency: home.currency,
            operatingCashLocalPerAnchor: home.fx,
            operatingCashIncomeLocal: (loss ? -100 - tax : funded ? -tax : 100 - tax) * home.fx,
            federalTaxByCountryAnchor: new Map([[home.country, tax]]),
            ...(kind === "AI household distribution"
              ? {
                  deferredProducerDistributions: recipients.map((row, i) => ({
                    walletId: `household-${i}`,
                    worldEpoch: "synthetic",
                    currency: row.currency,
                    localPerAnchor: row.fx,
                    amountAnchor: i ? 40 : 20,
                  })),
                }
              : {}),
          } as CorpSnapshot;
          const run = async (db: Db) => {
            if (kind !== "corporate dividend receipt")
              return settleCorporateTaxPriority(db, [snapshot], 2, now);
            await creditCorpDividends({
              db,
              lookups: {
                corpById: new Map([
                  [
                    id.toHexString(),
                    {
                      _id: id,
                      name: "Synthetic corporation",
                      countryId: home.country,
                      liquidCurrencyCode: home.currency,
                    },
                  ],
                ]),
                exchangeRatesByCurrency: new Map(countries.map((row) => [row.currency, row.fx])),
                domesticCorpTaxRateByCountry: new Map([[home.country, index === 3 ? 0 : 40]]),
              } as never,
              corpDividendPaymentsAnchorByCorpId: new Map([[id.toHexString(), 100]]),
              corpDividendPaymentsAnchorByCorpCurrency: new Map(),
              corpDividendTaxedAtSourceAnchorByCorpId: new Map(),
              turn: 2,
              now,
              thresholds: {} as never,
            });
          };
          const before = digest(f.memory);
          if (index === 4) {
            const failed = withInjectedCrash(f.memory, {
              collection: "bankMoneyMoves",
              op: "bulkWrite",
              onCall: 1,
              afterWrite: true,
            });
            await expect(run(failed.db)).rejects.toThrow();
            expect(digest(f.memory)).toBe(before);
          }
          await run(f.db);
          let cash = loss ? 100 : 200;
          const currentPaid = Math.min(cash, tax);
          cash -= currentPaid;
          const operatingPaid = loss ? Math.min(cash, 100) : 0;
          cash -= operatingPaid;
          const arrearsTaxPaid = Math.min(cash, oldTax);
          cash -= arrearsTaxPaid;
          const arrearsOperatingPaid = Math.min(cash, oldOperating);
          cash -= arrearsOperatingPaid;
          const householdPaid = kind === "AI household distribution" ? Math.min(cash, 60) : 0;
          cash -= householdPaid;
          const corp = await f.db.collection("corporations").findOne({ _id: id });
          expect(Number(corp?.liquidCapital) / home.fx).toBeCloseTo(cash, 7);
          expect(corp?.pendingOperatingCash).toBe(0);
          expect(
            (corp!.federalTaxArrearsAnchorByCountry as Record<string, number>)[home.country]
          ).toBeCloseTo(oldTax - arrearsTaxPaid + tax - currentPaid, 7);
          const opDebts = corp!.operatingCashArrearsByCurrency as Record<string, number>;
          const debtAnchor = Object.entries(opDebts).reduce(
            (sum, [currency, value]) =>
              sum + value / countries.find((row) => row.currency === currency)!.fx,
            0
          );
          expect(debtAnchor).toBeCloseTo(
            oldOperating - arrearsOperatingPaid + (loss ? 100 - operatingPaid : 0),
            7
          );
          const treasury = await f.db
            .collection("federalBudget")
            .findOne({ countryId: home.country });
          expect(Number(treasury?.treasuryCashLocal) / home.fx).toBeCloseTo(
            currentPaid + arrearsTaxPaid,
            7
          );
          let paidHouseholds = 0;
          for (const [i, row] of recipients.entries()) {
            const wallet = await f.db
              .collection("producerEconomyAccounts")
              .findOne({ _id: `household-${i}` as never });
            const paid = Number(wallet?.cash) / row.fx;
            expect(paid).toBeCloseTo(householdPaid * (i ? 2 / 3 : 1 / 3), 7);
            paidHouseholds += paid;
          }
          expect(
            cash +
              currentPaid +
              arrearsTaxPaid +
              operatingPaid +
              arrearsOperatingPaid +
              paidHouseholds
          ).toBeCloseTo(loss ? 100 : 200, 7);
          await assertLedger(f.db);
          const once = digest(f.memory);
          await run(f.db);
          expect(digest(f.memory)).toBe(once);
          if (kind === "corporate arrears recovery") {
            // Run four more genuine settlements: receipts must be independent by turn.
            for (let turn = 3; turn <= 6; turn++)
              await settleCorporateTaxPriority(f.db, [snapshot], turn, now);
            const recovered = await f.db.collection("corporations").findOne({ _id: id });
            expect(
              (recovered!.federalTaxArrearsAnchorByCountry as Record<string, number>)[home.country]
            ).toBeCloseTo(0, 7);
            for (const amount of Object.values(
              recovered!.operatingCashArrearsByCurrency as Record<string, number>
            ))
              expect(amount).toBeCloseTo(0, 7);
          }
          output.push({
            type: kind,
            country: home.country,
            scenario,
            grossOperatingAnchor: loss ? -100 : 100,
            currentTaxAnchor: currentPaid,
            arrearsTaxPaidAnchor: arrearsTaxPaid,
            arrearsOperatingPaidAnchor: arrearsOperatingPaid,
            householdPaidAnchor: paidHouseholds,
            closingCashAnchor: cash,
            replay: "unchanged",
            rollback: index === 4 ? "verified" : "not injected",
          });
        });
      }
});

const guardedPayments = [
  "share purchase",
  "bond purchase",
  "fund subscription",
  "subsidiary capital injection",
  "spin-off funding",
  "sector expansion",
  "plant construction",
  "strategy retool",
  "strategy cancellation",
  "headquarters relocation",
  "acquisition",
  "corporate rename",
  "tech unlock",
  "union action",
  "parent bond subsidy",
] as const;
const guards = [
  { name: "clear", cash: 100, tax: 0, operating: 0, held: 0, allowed: true },
  { name: "unpaid tax", cash: 100, tax: 10, operating: 0, held: 0, allowed: false },
  { name: "unpaid operating debt", cash: 100, tax: 0, operating: 10, held: 0, allowed: false },
  { name: "unsettled receipts", cash: 100, tax: 0, operating: 0, held: 50, allowed: false },
  { name: "insufficient spendable cash", cash: 1, tax: 0, operating: 0, held: 0, allowed: false },
] as const;
describe("discretionary payment guard matrix", () => {
  for (const kind of [
    ...guardedPayments,
    "issuer capped buyback",
    "issuer legacy floored buyback",
    "statutory fine or pension",
  ] as const)
    for (const home of countries)
      for (const scenario of guards) {
        it(`${kind}: ${home.country}: ${scenario.name}`, async () => {
          const f = memoryWorld(home);
          const id = new ObjectId(),
            recipient = new ObjectId();
          f.memory.seed("corporations", [
            {
              _id: id,
              liquidCapital: scenario.cash * home.fx,
              shareEscrowBalance: 0,
              pendingOperatingCash: scenario.held * home.fx,
              federalTaxArrearsAnchorByCountry: { [home.country]: scenario.tax },
              operatingCashArrearsByCurrency: { [home.currency]: scenario.operating * home.fx },
            },
            { _id: recipient, liquidCapital: 0 },
          ]);
          const cost = 20 * home.fx;
          const statutory = kind === "statutory fine or pension";
          const floored = kind === "issuer legacy floored buyback";
          let paid: boolean;
          if (kind === "issuer capped buyback")
            paid = !!(await debitCorpShareEscrowCapped(f.db, id, cost));
          else if (floored) paid = !!(await debitCorpShareEscrowFloored(f.db, id, cost));
          else if (
            statutory ||
            [
              "share purchase",
              "bond purchase",
              "fund subscription",
              "subsidiary capital injection",
              "spin-off funding",
            ].includes(kind)
          )
            paid = (
              await atomicallyDebitCorpLiquidCapital(f.db, id, cost, {
                corporateObligation: statutory,
              })
            ).ok;
          else
            paid =
              (
                await f.db.collection("corporations").updateOne(
                  {
                    _id: id,
                    liquidCapital: { $gte: cost },
                    ...corporateDiscretionaryCashGuard(),
                  },
                  { $inc: { liquidCapital: -cost } }
                )
              ).matchedCount === 1;
          const expected = statutory
            ? scenario.cash >= 20
            : floored && scenario.name === "insufficient spendable cash"
              ? true
              : scenario.allowed;
          expect(paid).toBe(expected);
          if (paid)
            await f.db
              .collection("corporations")
              .updateOne({ _id: recipient }, { $inc: { liquidCapital: cost } });
          const sender = await f.db.collection("corporations").findOne({ _id: id });
          const receiver = await f.db.collection("corporations").findOne({ _id: recipient });
          expect(Number(sender?.liquidCapital) / home.fx).toBeCloseTo(
            scenario.cash - (paid ? 20 : 0),
            7
          );
          expect(Number(receiver?.liquidCapital) / home.fx).toBeCloseTo(paid ? 20 : 0, 7);
          expect(
            (Number(sender?.liquidCapital) + Number(receiver?.liquidCapital)) / home.fx
          ).toBeCloseTo(scenario.cash, 7);
          expect(sender?.pendingOperatingCash).toBe(scenario.held * home.fx);
          output.push({
            type: kind,
            country: home.country,
            scenario: scenario.name,
            paid,
            amountAnchor: paid ? 20 : 0,
            taxWithheldAnchor: 0,
            note:
              floored && scenario.name === "insufficient spendable cash"
                ? "Existing legacy stage permits an overdraft; capped mode rejects it."
                : "Guarded outflow only; asset-sale recipient taxation is a separate settlement.",
          });
        });
      }
});

const chains = [
  "earnings to CEO salary",
  "earnings to shareholder dividend",
  "earnings through corporate holder to shareholder",
] as const;
describe("linked payer-to-recipient transaction chains", () => {
  for (const kind of chains)
    for (const home of countries)
      for (const [index, scenario] of scenarios.entries()) {
        it(`${kind}: ${home.country}: ${scenario}`, async () => {
          const f = memoryWorld(home, index === 3);
          const source =
            index === 4 ? countries.find((row) => row.currency !== home.currency)! : home;
          if (source.country !== home.country)
            await f.db.collection("federalBudget").insertOne({
              _id: source.country as never,
              countryId: source.country,
              currencyCode: source.currency,
              treasuryBalance: 0,
              treasuryCashLocal: 0,
            });
          const id = new ObjectId(),
            parent = new ObjectId(),
            character = new ObjectId();
          const salary = kind === "earnings to CEO salary";
          const viaParent = kind === "earnings through corporate holder to shareholder";
          const grossPayout = viaParent ? 50 : 100;
          const corporateTax = index === 3 ? 0 : salary ? 20 : 40;
          const parentTax = index === 3 || !viaParent ? 0 : 20;
          const oldDebt = [0, 20, 200, 50, 50][index];
          f.memory.seed("corporations", [
            {
              _id: id,
              countryId: source.country,
              liquidCurrencyCode: source.currency,
              liquidCapital: 0,
              pendingOperatingCash: 200 * source.fx,
            },
            {
              _id: parent,
              name: "Synthetic holding corporation",
              countryId: source.country,
              liquidCurrencyCode: source.currency,
              liquidCapital: 0,
            },
          ]);
          f.memory.seed("characters", [
            {
              _id: character,
              name: "Synthetic shareholder",
              countryId: home.country,
              homeState: "REGION",
              incomeTaxStartTurn: 1,
              currencyBalances: { personal: { USD: 0, GBP: 0, JPY: 0 } },
            },
          ]);
          f.memory.seed(
            "playerIncomeTaxAssessments",
            oldDebt
              ? [
                  {
                    _id: "chain-debt",
                    characterId: character,
                    ownerCollection: "characters",
                    worldId: "synthetic",
                    turn: 1,
                    name: "Synthetic shareholder",
                    tier: "high",
                    currency: home.currency,
                    sourcePath: "currencyBalances.personal." + home.currency,
                    sourceFx: home.fx,
                    walletFx: home.fx,
                    countryId: home.country,
                    nationalBudgetId: f.budgetId,
                    nationalCurrency: home.currency,
                    nationalFx: home.fx,
                    stateId: "REGION",
                    regionalCurrency: home.currency,
                    regionalFx: home.fx,
                    gross: 1000 * home.fx,
                    federal: oldDebt * 0.8 * home.fx,
                    regional: oldDebt * 0.2 * home.fx,
                    net: (1000 - oldDebt) * home.fx,
                    status: "unpaid",
                    createdAt: now,
                  },
                ]
              : []
          );
          // Gross operating receipts are already held by the funded producer. The
          // corporation deducts the 100 salary/distribution, and its quoted tax,
          // in the same way as the corporation turn's residual cash settlement.
          const quote = {
            corpId: id,
            operatingCashCurrency: source.currency,
            operatingCashLocalPerAnchor: source.fx,
            operatingCashIncomeLocal: (-corporateTax - 100) * source.fx,
            federalTaxByCountryAnchor: new Map([[source.country, corporateTax]]),
          } as CorpSnapshot;
          await settleCorporateTaxPriority(f.db, [quote], 2, now);
          if (viaParent) {
            await creditCorpDividends({
              db: f.db,
              lookups: {
                corpById: new Map([
                  [
                    parent.toHexString(),
                    {
                      _id: parent,
                      name: "Synthetic holding corporation",
                      countryId: source.country,
                      liquidCurrencyCode: source.currency,
                    },
                  ],
                ]),
                exchangeRatesByCurrency: new Map(countries.map((row) => [row.currency, row.fx])),
                domesticCorpTaxRateByCountry: new Map([[source.country, index === 3 ? 0 : 40]]),
              } as never,
              corpDividendPaymentsAnchorByCorpId: new Map([[parent.toHexString(), 100]]),
              corpDividendPaymentsAnchorByCorpCurrency: new Map(),
              corpDividendTaxedAtSourceAnchorByCorpId: new Map(),
              turn: 2,
              now,
              thresholds: {} as never,
            });
            expect(
              (await atomicallyDebitCorpLiquidCapital(f.db, parent, grossPayout * source.fx)).ok
            ).toBe(true);
          }
          const credit: IncomeCredit = {
            characterId: character,
            ownerCollection: "characters",
            currency: source.currency,
            gross: grossPayout * source.fx,
            income: grossPayout * source.fx,
          };
          if (index === 4) {
            const before = digest(f.memory);
            const failed = withInjectedCrash(f.memory, {
              collection: "playerIncomeTaxBatches",
              op: "insertOne",
              onCall: 1,
              afterWrite: true,
            });
            await expect(
              creditIncomeAfterTax(failed.db, "corporation", 2, now, [credit])
            ).rejects.toThrow();
            expect(digest(f.memory)).toBe(before);
            // A turn retry revisits the already-settled corporate payment first.
            await settleCorporateTaxPriority(f.db, [quote], 2, now);
            expect(digest(f.memory)).toBe(before);
          }
          const [result] = await creditIncomeAfterTax(f.db, "corporation", 2, now, [credit]);
          const personalTax = index === 3 ? 0 : grossPayout * 0.3;
          const arrearsPaid = Math.min(oldDebt, grossPayout - personalTax);
          expect(result.currentTax / source.fx).toBeCloseTo(personalTax, 7);
          expect(result.arrearsPaid / source.fx).toBeCloseTo(arrearsPaid, 7);
          const owner = await f.db.collection("characters").findOne({ _id: character });
          const wallet = owner!.currencyBalances as { personal: Record<string, number> };
          const personalNet = wallet.personal[source.currency] / source.fx;
          expect(personalNet).toBeCloseTo(grossPayout - personalTax - arrearsPaid, 7);
          const payers = await f.db.collection("corporations").find({}).toArray();
          const retained = payers.reduce(
            (sum, row) => sum + Number(row.liquidCapital) / source.fx,
            0
          );
          const budgets = await f.db.collection("federalBudget").find({}).toArray();
          const government = budgets.reduce(
            (sum, row) =>
              sum +
              Number(row.treasuryCashLocal) /
                countries.find((country) => country.currency === row.currencyCode)!.fx,
            0
          );
          const regional =
            Number(
              (await f.db.collection("stateBudgets").findOne({ _id: "REGION" as never }))?.balance
            ) / home.fx;
          expect(government + regional).toBeCloseTo(
            corporateTax + parentTax + personalTax + arrearsPaid,
            7
          );
          expect(retained + government + regional + personalNet).toBeCloseTo(200, 7);
          const once = digest(f.memory);
          await creditIncomeAfterTax(f.db, "corporation", 2, now, [credit]);
          expect(digest(f.memory)).toBe(once);
          await assertLedger(f.db);
          output.push({
            type: kind,
            country: home.country,
            scenario,
            operatingReceiptAnchor: 200,
            corporateTaxAnchor: corporateTax,
            corporateHolderTaxAnchor: parentTax,
            personalTaxAnchor: personalTax,
            arrearsPaidAnchor: arrearsPaid,
            personalNetAnchor: personalNet,
            retainedCorporateCashAnchor: retained,
            conservation: "200 anchor accounted for",
            replay: "unchanged",
          });
        });
      }
});

afterAll(() => {
  const byType: Record<string, number> = {};
  for (const row of output) byType[String(row.type)] = (byType[String(row.type)] ?? 0) + 1;
  for (const type of [
    ...personal,
    ...corporate,
    ...guardedPayments,
    "issuer capped buyback",
    "issuer legacy floored buyback",
    "statutory fine or pension",
    ...chains,
  ])
    expect(byType[type], "Five scenarios in each of three countries: " + type).toBe(15);
  if (!process.env.AHD_TAX_SIM_REPORT) return;
  writeFileSync(
    process.env.AHD_TAX_SIM_REPORT,
    JSON.stringify(
      {
        scope:
          "Production settlement services and shared debit guards in a stateful in-memory database. Gross producer funding is seeded/prepared; this is not a native Mongo or full-world replay.",
        countries: countries.map((row) => row.country),
        scenariosPerTypePerCountry: 5,
        total: output.length,
        byType,
        results: output,
      },
      null,
      2
    ) + "\n"
  );
});
