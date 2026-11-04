import { describe, expect, it } from "vitest";
import { advanceProducerEconomy, type ProductionPlan } from "./production";
import {
  nextProbeFailures,
  probePaidForItself,
  restartProbe,
  RESTART_PROBE_MAX_FAILURES,
  type RestartProbePlant,
} from "./restartProbeRules";
import type { MarketAccount, ProducerOffer, PurchaseOrder } from "./rules";

// An idle mill: 100 units a turn from 100 ore, wages 20, site bill 10 of which
// 4 is cold upkeep. It sold nothing last turn (no expectedUnitRevenue) and its
// company has no cash. Steel last cleared at 8 and ore at 1.
const mill = (changes: Partial<ProductionPlan> = {}): ProductionPlan => ({
  id: "mill",
  accountId: "corp",
  capacityUnits: 100,
  activeFraction: 1,
  outputMultiplier: 1,
  labourCost: 20,
  otherOperatingCost: 10,
  idleOperatingCost: 4,
  labourRecipientAccountId: "households",
  operatingRecipientAccountId: "services",
  inputs: [{ commodity: "ore", unitsPerOutput: 1, book: "world", maximumUnitPrice: 2 }],
  outputs: [
    {
      commodity: "steel",
      unitsPerOutput: 1,
      book: "world",
      policy: { kind: "manual", unitPrice: 8 },
      referenceUnitPrice: 8,
      storable: false,
    },
  ],
  inputStock: [],
  outputStock: [],
  ...changes,
});
const ore: ProducerOffer = {
  id: "ore",
  accountId: "supplier",
  commodity: "ore",
  book: "world",
  units: 1000,
  unitPrice: 1,
};
const buyer = (units = 10): PurchaseOrder => ({
  id: "buyer",
  accountId: "buyers",
  commodity: "steel",
  book: "world",
  units,
  maximumUnitPrice: 8,
});
const accounts = (corp = 0, buyers = 1000): MarketAccount[] => [
  { id: "corp", cash: corp },
  { id: "households", cash: 0 },
  { id: "services", cash: 0 },
  { id: "buyers", cash: buyers },
  { id: "supplier", cash: 0 },
  { id: "rival", cash: 0 },
];
const total = (rows: readonly MarketAccount[]) => rows.reduce((n, r) => n + r.cash, 0);
const owed = (claims: readonly { amount: number }[]) => claims.reduce((n, c) => n + c.amount, 0);
const clearing = { "steel|world": 8, "ore|world": 1 };

const settle = (
  input: {
    plan?: Partial<ProductionPlan>;
    orders?: PurchaseOrder[];
    offers?: ProducerOffer[];
    restartProbes?: boolean;
  } = {}
) =>
  advanceProducerEconomy({
    turn: 2,
    accounts: accounts(),
    producers: [mill(input.plan)],
    externalOffers: input.offers ?? [ore],
    externalOrders: input.orders ?? [buyer()],
    clearingPriceByLane: clearing,
    ...(input.restartProbes != null ? { restartProbes: input.restartProbes } : {}),
  });

// The rules on the same mill: a probe of 5 units earns 5 x 8 x 0.9 = 36 and
// costs 5% of the 26 running bills (1.3) plus 5 ore at 1 = 6.3.
const plant = (changes: Partial<RestartProbePlant> = {}): RestartProbePlant => ({
  fullUnits: 100,
  labourCost: 20,
  runningSiteCost: 6,
  inputs: [{ unitsPerOutput: 1, maximumUnitPrice: 2, clearingUnitPrice: 1, stockUnits: 0 }],
  outputs: [{ unitsPerOutput: 1, marketUnitPrice: 8, fundedBuyers: true }],
  ...changes,
});

describe("restart probe rules", () => {
  it("probes 5% of capacity, financed up to its ceiling cost and capped by its revenue", () => {
    const probe = restartProbe(plant())!;
    expect(probe.runShare).toBe(0.05);
    expect(probe.expectedRevenue).toBeCloseTo(36);
    expect(probe.expectedCost).toBeCloseTo(6.3);
    // Ceiling cost: 1.3 + 5 ore at 2 = 11.3, under the revenue.
    expect(probe.advance).toBeCloseTo(11.3);
    // A dear ceiling is capped by the probe's revenue.
    const dear = restartProbe(
      plant({
        inputs: [{ unitsPerOutput: 1, maximumUnitPrice: 50, clearingUnitPrice: 1, stockUnits: 0 }],
      })
    )!;
    expect(dear.advance).toBeCloseTo(36);
  });

  it("never probes more than 10% of capacity", () => {
    expect(restartProbe(plant(), { runShare: 0.5 })!.runShare).toBe(0.1);
  });

  it("does not probe without funded buyers, a market price or a physical run", () => {
    expect(
      restartProbe(
        plant({ outputs: [{ unitsPerOutput: 1, marketUnitPrice: 8, fundedBuyers: false }] })
      )
    ).toBeNull();
    expect(
      restartProbe(plant({ outputs: [{ unitsPerOutput: 1, fundedBuyers: true }] }))
    ).toBeNull();
    expect(restartProbe(plant({ fullUnits: 0 }))).toBeNull();
  });

  it("does not probe when the probe loses money at market prices", () => {
    // Steel at 1.2: 5 x 1.2 x 0.9 = 5.4 against 6.3.
    expect(
      restartProbe(
        plant({ outputs: [{ unitsPerOutput: 1, marketUnitPrice: 1.2, fundedBuyers: true }] })
      )
    ).toBeNull();
  });

  it("stops after three failed probes in a row", () => {
    expect(restartProbe(plant({ priorFailures: 2 }))).not.toBeNull();
    expect(restartProbe(plant({ priorFailures: RESTART_PROBE_MAX_FAILURES }))).toBeNull();
    expect(nextProbeFailures({ priorFailures: 2, probed: true, paid: false })).toBe(3);
    expect(nextProbeFailures({ priorFailures: 2, probed: true, paid: true })).toBe(0);
    expect(nextProbeFailures({ priorFailures: 2, probed: false, paid: false })).toBe(2);
    expect(nextProbeFailures({ priorFailures: 3, probed: false, paid: true })).toBe(0);
  });

  it("counts a run that sold nothing as not paying, and cold upkeep as no running cost", () => {
    expect(probePaidForItself({ revenue: 0, profit: 0 })).toBe(false);
    expect(probePaidForItself({ revenue: 10, profit: -4, idleOperatingCost: 4 })).toBe(true);
    expect(probePaidForItself({ revenue: 10, profit: -5, idleOperatingCost: 4 })).toBe(false);
  });
});

describe("restart probe in the settlement", () => {
  it("off: an idle plant with no cash and no sales stays idle, and off equals absent", () => {
    const run = settle();
    expect(run.producers[0].producedUnits).toBe(0);
    expect(run.producers[0].restartProbe).toBeUndefined();
    expect(JSON.stringify(settle({ restartProbes: false }))).toBe(JSON.stringify(run));
  });

  it("on: the plant probes against funded buyers and its sales repay the credit", () => {
    const run = settle({ restartProbes: true });
    const p = run.producers[0];
    expect(p.restartProbe).toBe(true);
    expect(p.restartProbeFailures).toBeUndefined();
    expect(p.producedUnits).toBeCloseTo(5);
    expect(p.revenue).toBeCloseTo(40);
    expect(p.purchases).toBeCloseTo(5);
    // Wages and the running site bill on the probe are paid from its sales;
    // only the cold upkeep the plant owed anyway is left, and it is paid too.
    expect(p.labourPaid).toBeCloseTo(1);
    expect(owed(run.payables)).toBeCloseTo(0);
    for (const account of run.accounts) expect(account.cash).toBeGreaterThanOrEqual(0);
    expect(total(run.accounts)).toBeCloseTo(total(accounts()));
  });

  it("on: a plant whose output has no funded buyer stays idle", () => {
    for (const orders of [[], [{ ...buyer(), maximumUnitPrice: 5 }]]) {
      const run = settle({ restartProbes: true, orders });
      expect(run.producers[0].producedUnits).toBe(0);
      expect(run.producers[0].restartProbe).toBeUndefined();
    }
    // The company's own demand is not a buyer for its probe.
    const own = settle({ restartProbes: true, orders: [{ ...buyer(), accountId: "corp" }] });
    expect(own.producers[0].restartProbe).toBeUndefined();
  });

  it("on: what an unsold probe cannot pay stays an ordinary payable", () => {
    // A rival sells steel cheaper and fills the buyer; the probe runs on ore
    // in stock, sells nothing and owes its wages and running site bill.
    const rival: ProducerOffer = {
      id: "rival",
      accountId: "rival",
      commodity: "steel",
      book: "world",
      units: 1000,
      unitPrice: 7,
    };
    const plan = { inputStock: [{ commodity: "ore", units: 5, value: 5 }] };
    const off = settle({ plan, offers: [ore, rival] });
    const run = settle({ plan, offers: [ore, rival], restartProbes: true });
    const p = run.producers[0];
    expect(p.restartProbe).toBe(true);
    expect(p.producedUnits).toBeCloseTo(5);
    expect(p.revenue).toBe(0);
    expect(p.restartProbeFailures).toBe(1);
    // Off owes the cold upkeep 4; the probe adds its 1 of wages and 0.3 of site bill.
    expect(owed(off.payables)).toBeCloseTo(4);
    expect(owed(run.payables)).toBeCloseTo(5.3);
    for (const account of run.accounts) expect(account.cash).toBeGreaterThanOrEqual(0);
    expect(total(run.accounts)).toBeCloseTo(total(accounts()));
  });

  it("on: a plant stops probing after three probes in a row that did not pay", () => {
    const rival: ProducerOffer = {
      id: "rival",
      accountId: "rival",
      commodity: "steel",
      book: "world",
      units: 1000,
      unitPrice: 7,
    };
    let failures: number | undefined;
    const seen: (number | undefined)[] = [];
    for (let turn = 0; turn < 4; turn++) {
      const run = settle({
        plan: {
          inputStock: [{ commodity: "ore", units: 5, value: 5 }],
          ...(failures != null ? { restartProbeFailures: failures } : {}),
        },
        offers: [ore, rival],
        restartProbes: true,
      });
      seen.push(run.producers[0].restartProbe ? run.producers[0].restartProbeFailures : -1);
      failures = run.producers[0].restartProbeFailures;
    }
    expect(seen).toEqual([1, 2, 3, -1]);
    // The count stays on the receipt while the plant is stopped.
    expect(failures).toBe(3);
  });

  it("on: a company with cash for a run or a plant with sales to borrow against does not probe", () => {
    const funded = advanceProducerEconomy({
      turn: 2,
      accounts: accounts(1000),
      producers: [mill()],
      externalOffers: [ore],
      externalOrders: [buyer()],
      clearingPriceByLane: clearing,
      restartProbes: true,
    });
    expect(funded.producers[0].restartProbe).toBeUndefined();
    const selling = settle({ plan: { expectedUnitRevenue: 0.5 }, restartProbes: true });
    expect(selling.producers[0].restartProbe).toBeUndefined();
  });
});
