/**
 * Offline what-if for the wider economy: replays one settled turn's producer
 * market with and without the after-market wider-economy pass, using the same
 * builders and pass the live turn runs (wideEconomyRules), and compares them.
 *
 *   REQUEST=<request.json> STATES=<states.json> [COUNTRY=US] \
 *     npx tsx scripts/sim/wideEconomySupplyReplay.ts
 *
 * STATES is a list of { id, countryId, gdpAnchor } for the plant countries.
 * With BOOST=1 the request must already carry the live wider economy; see boostMain.
 * The baseline is this turn's world demand (the live turn averages the last
 * three). Reads two local files; touches no database.
 */
import fs from "node:fs";
import { advanceProducerEconomy } from "@/lib/market/producerMarket/production";
import { laneKeyOf } from "@/lib/market/producerMarket/laneKey";
import { bookPressure } from "@/lib/market/producerMarket/shortageGrowthRules";
import {
  wideEconomyBaseline,
  wideEconomyBoostOffers,
  wideEconomyLaneShortage,
  wideEconomyOffers,
  wideEconomyOrders,
  wideEconomyShortageBoost,
} from "@/lib/market/producerMarket/wideEconomyRules";

type Request = Parameters<typeof advanceProducerEconomy>[0];
type Result = ReturnType<typeof advanceProducerEconomy>;

const request = JSON.parse(fs.readFileSync(process.env.REQUEST!, "utf8")) as Request;
const states = (
  process.env.STATES ? JSON.parse(fs.readFileSync(process.env.STATES, "utf8")) : []
) as {
  id: string;
  countryId: string;
  gdpAnchor: number;
}[];
const COUNTRY = process.env.COUNTRY ?? "US";

// The live turn passes each plant's country; a stored request cannot carry the
// function, so rebuild it from the plant's wage payee scope.
const plantCountry = new Map(
  request.producers.map((p) => {
    try {
      return [p.id, String((JSON.parse(p.labourRecipientAccountId) as unknown[])[2] ?? "")];
    } catch {
      return [p.id, ""];
    }
  })
);
request.countryOfProducer = (id: string) => plantCountry.get(id) || undefined;
const clone = (q: Request): Request => ({
  ...(JSON.parse(JSON.stringify(q)) as Request),
  countryOfProducer: request.countryOfProducer,
});
const wideAccount = (countryId: string) => `wide:${countryId}`;
const isWide = (id: string) => id.startsWith("wide:") || id.startsWith('["wide"');

/** The book a good trades on in this request: world, one per country, or one per state. */
function bookOf(commodity: string, stateId: string, countryId: string): string {
  for (const p of request.producers)
    for (const o of p.outputs) {
      if (o.commodity !== commodity) continue;
      if (o.book.startsWith("state:")) return `state:${stateId}`;
      if (o.book.startsWith("country:")) return `country:${countryId}`;
      return o.book;
    }
  return "world";
}

/** Reference price: the lane's last clearing price, else the plants' reference price. */
function referencePrice(commodity: string, book: string): number | null {
  const lanes = (request as { clearingPriceByLane?: Record<string, number> }).clearingPriceByLane;
  const cleared = lanes?.[laneKeyOf(commodity, book)];
  if (cleared != null && cleared > 0) return cleared;
  const refs = request.producers.flatMap((p) =>
    p.outputs.filter((o) => o.commodity === commodity).map((o) => o.referenceUnitPrice)
  );
  return refs.length > 0 ? refs.reduce((a, b) => a + b, 0) / refs.length : null;
}

function withWideEconomy(base: Result): Request {
  const worldDemand = new Map<string, number>();
  for (const row of base.countryBooks ?? [])
    worldDemand.set(row.commodity, (worldDemand.get(row.commodity) ?? 0) + row.demand);
  const baseline = wideEconomyBaseline({
    turns: [[...worldDemand].map(([commodity, demand]) => ({ commodity, supply: 0, demand }))],
    states: states.map((s) => ({ stateId: s.id, countryId: s.countryId, realGdp: s.gdpAnchor })),
  });
  const stateCountry = new Map(states.map((s) => [s.id, s.countryId]));
  const lineInput = {
    baseline,
    realGdpNow: new Map(states.map((s) => [s.id, s.gdpAnchor])),
    accountId: wideAccount,
    referencePrice: (commodity: string, stateId: string) =>
      referencePrice(
        commodity,
        stateId
          ? bookOf(commodity, stateId, stateCountry.get(stateId) ?? "")
          : bookOf(commodity, "", "")
      ),
    isStateScoped: (commodity: string) => bookOf(commodity, "X", "Y") !== bookOf(commodity, "", ""),
    mapBook: (book: string, commodity: string, countryId: string) =>
      book.startsWith("state:")
        ? bookOf(commodity, book.slice(6), countryId)
        : bookOf(commodity, "", countryId),
  };
  // Live: a world-book buyer reaches plant output only, never a background country's offer.
  const plantOffersOf = new Map<string, string[]>();
  for (const p of request.producers)
    for (const o of p.outputs)
      if (o.book === "world")
        plantOffersOf.set(o.commodity, [
          ...(plantOffersOf.get(o.commodity) ?? []),
          JSON.stringify([p.id, "output", o.commodity]),
        ]);
  const orders = wideEconomyOrders(lineInput).map((o) =>
    o.book === "world" ? { ...o, eligibleOfferIds: plantOffersOf.get(o.commodity) ?? [] } : o
  );
  const offers = wideEconomyOffers(lineInput);
  const funding = new Map<string, number>();
  for (const o of orders)
    funding.set(o.accountId, (funding.get(o.accountId) ?? 0) + o.maximumSpend!);
  return {
    ...request,
    accounts: [
      ...request.accounts,
      ...[...new Set([...orders, ...offers].map((x) => x.accountId))].map((id) => ({
        id,
        cash: funding.get(id) ?? 0,
      })),
    ],
    residualOrders: orders,
    residualOffers: offers,
  };
}

function goods(result: Result, req: Request) {
  const out: Record<string, Record<string, number>> = {};
  const g = (c: string) =>
    (out[c] ||= {
      plantSold: 0,
      plantRevenue: 0,
      realRequested: 0,
      realDelivered: 0,
      seededBought: 0,
      seededBuyerSpend: 0,
      seededSold: 0,
      seededSellerRevenue: 0,
      countrySupply: 0,
      countryDemand: 0,
      countryFilled: 0,
      worldSupply: 0,
      worldDemand: 0,
    });
  for (const p of result.producers)
    for (const x of p.products) {
      g(x.commodity).plantSold += x.soldUnits ?? 0;
      g(x.commodity).plantRevenue += x.revenue ?? 0;
    }
  for (const o of result.orderOutcomes ?? []) {
    const r = g(o.commodity);
    if (isWide(o.accountId)) r.seededBought += o.deliveredUnits;
    else {
      r.realRequested += o.requestedUnits;
      r.realDelivered += o.deliveredUnits;
    }
  }
  const spendByOrder = new Map<string, number>();
  for (const f of result.tradeReceipt.fills)
    spendByOrder.set(f.orderId, (spendByOrder.get(f.orderId) ?? 0) + f.units * f.unitPrice);
  for (const o of req.residualOrders ?? [])
    g(o.commodity).seededBuyerSpend += spendByOrder.get(o.id) ?? 0;
  // Seller takings: fills drawn from the wider economy's own book.
  const orderById = new Map(result.tradeReceipt.orders.map((o) => [o.id, o]));
  for (const f of result.tradeReceipt.fills) {
    const order = orderById.get(f.orderId);
    if (!order || !(f as { spillBook?: string }).spillBook?.startsWith("wide:")) continue;
    g(order.commodity).seededSold += f.units;
    g(order.commodity).seededSellerRevenue += f.units * f.unitPrice;
  }
  for (const row of result.countryBooks ?? []) {
    const r = g(row.commodity);
    r.worldSupply += row.supply;
    r.worldDemand += row.demand;
    if (row.countryId !== COUNTRY) continue;
    r.countrySupply += row.supply;
    r.countryDemand += row.demand;
    r.countryFilled += row.filled ?? 0;
  }
  return out;
}

/** Funded scarcity move the price phase would take on this book (scarcityDrift). */
const scarcityMove = (supply: number, demand: number) => {
  const larger = Math.max(supply, demand);
  if (!(larger > 0)) return 0;
  return Math.max(-0.06, Math.min(0.06, 0.5 * ((demand - supply) / larger)));
};

/**
 * BOOST=1 on a request that already carries the live wider economy: compare it
 * with the same request plus the short-lane boost (from this turn's measured
 * real shortage, as if it held for the whole window) and background
 * countries' imports allowed to fall back on it.
 */
function boostMain() {
  // Background countries hold their import budget (their orders' spend limits),
  // as the live turn funds them; FUND_BACKGROUND=0 keeps the request's cash.
  if (process.env.FUND_BACKGROUND !== "0") {
    const budget = new Map<string, number>();
    for (const o of request.externalOrders ?? [])
      if (o.accountId.includes('"backgroundEconomy"'))
        budget.set(o.accountId, (budget.get(o.accountId) ?? 0) + (o.maximumSpend ?? 0));
    request.accounts = request.accounts.map((a) =>
      budget.has(a.id) ? { ...a, cash: Math.max(a.cash, budget.get(a.id)!) } : a
    );
  }
  const before = advanceProducerEconomy(clone(request));
  const isWide = (id: string) => id.includes('"wideEconomy"');
  const shortage = wideEconomyLaneShortage({
    outcomes: before.orderOutcomes ?? [],
    orders: before.tradeReceipt.orders,
    fills: before.tradeReceipt.fills as { orderId: string; units: number; spillBook?: string }[],
    isWideAccount: isWide,
    laneKey: laneKeyOf,
  });
  const boost = wideEconomyShortageBoost([shortage, shortage, shortage]);
  const req: Request = {
    ...request,
    residualBoostOffers: wideEconomyBoostOffers(request.residualOffers ?? [], boost, laneKeyOf),
    residualExportBuyers: request.accounts
      .map((a) => a.id)
      .filter((id) => id.includes('"backgroundEconomy"')),
  };
  const after = advanceProducerEconomy(clone(req));
  const pb = bookPressure(before.orderOutcomes ?? []);
  const pa = bookPressure(after.orderOutcomes ?? []);
  const shortageAfter = wideEconomyLaneShortage({
    outcomes: after.orderOutcomes ?? [],
    orders: after.tradeReceipt.orders,
    fills: after.tradeReceipt.fills as { orderId: string; units: number; spillBook?: string }[],
    isWideAccount: isWide,
    laneKey: laneKeyOf,
  });
  const per = (r: Result) => {
    const out: Record<string, Record<string, number>> = {};
    const g = (c: string) =>
      (out[c] ||= {
        plantSold: 0,
        plantRevenue: 0,
        homeGot: 0,
        homeAsked: 0,
        bgGot: 0,
        bgAsked: 0,
        seededHome: 0,
        seededExport: 0,
        seededLine: 0,
      });
    for (const p of r.producers)
      for (const x of p.products) {
        g(x.commodity).plantSold += x.soldUnits ?? 0;
        g(x.commodity).plantRevenue += x.revenue ?? 0;
      }
    for (const o of r.orderOutcomes ?? []) {
      if (isWide(o.accountId)) continue;
      const bg = o.accountId.includes('"backgroundEconomy"');
      g(o.commodity)[bg ? "bgAsked" : "homeAsked"] += o.requestedUnits;
      g(o.commodity)[bg ? "bgGot" : "homeGot"] += o.deliveredUnits;
    }
    const orderById = new Map(r.tradeReceipt.orders.map((o) => [o.id, o]));
    for (const f of r.tradeReceipt.fills as {
      orderId: string;
      units: number;
      spillBook?: string;
    }[]) {
      if (!f.spillBook?.startsWith("wide:")) continue;
      const o = orderById.get(f.orderId)!;
      g(o.commodity)[o.accountId.includes('"backgroundEconomy"') ? "seededExport" : "seededHome"] +=
        f.units;
    }
    return out;
  };
  const b = per(before);
  const a = per(after);
  for (const o of request.residualOffers ?? [])
    if (b[o.commodity]) b[o.commodity]!.seededLine += o.units;
  for (const o of req.residualOffers ?? [])
    if (a[o.commodity]) a[o.commodity]!.seededLine += o.units;
  const rows = Object.keys(a)
    .sort()
    .map((c) => ({
      commodity: c,
      boost: boost.get(laneKeyOf(c, "world")) ?? 1,
      before: b[c],
      after: a[c],
      worldShortageBefore: shortage[laneKeyOf(c, "world")],
      worldShortageAfter: shortageAfter[laneKeyOf(c, "world")],
      pressureBefore: pb[laneKeyOf(c, "world")],
      pressureAfter: pa[laneKeyOf(c, "world")],
    }));
  const total = (r: Result) => r.accounts.reduce((sum, x) => sum + x.cash, 0);
  const opening = (q: Request) => q.accounts.reduce((sum, x) => sum + x.cash, 0);
  process.stdout.write(
    JSON.stringify(
      {
        turn: request.turn,
        boostedLanes: Object.fromEntries(boost),
        marketCash: {
          before: { opening: opening(request), closing: total(before) },
          after: { opening: opening(req), closing: total(after) },
        },
        rows,
      },
      null,
      1
    )
  );
}

function main() {
  const base = advanceProducerEconomy(clone(request));
  const req = withWideEconomy(base);
  if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(req));
  const on = advanceProducerEconomy(clone(req));
  const before = goods(base, request);
  const after = goods(on, req);
  const rows = Object.keys(after)
    .sort()
    .map((c) => {
      const b = before[c] ?? {};
      const a = after[c]!;
      return {
        commodity: c,
        plantSoldBefore: b.plantSold ?? 0,
        plantSoldAfter: a.plantSold,
        plantRevenueBefore: b.plantRevenue ?? 0,
        plantRevenueAfter: a.plantRevenue,
        realDeliveredBefore: b.realDelivered ?? 0,
        realDeliveredAfter: a.realDelivered,
        realRequested: a.realRequested,
        seededSold: a.seededSold,
        seededSellerRevenue: a.seededSellerRevenue,
        seededBought: a.seededBought,
        seededBuyerSpend: a.seededBuyerSpend,
        [`${COUNTRY}SupplyBefore`]: b.countrySupply ?? 0,
        [`${COUNTRY}SupplyAfter`]: a.countrySupply,
        [`${COUNTRY}Demand`]: a.countryDemand,
        worldSupplyBefore: b.worldSupply ?? 0,
        worldSupplyAfter: a.worldSupply,
        worldDemandBefore: b.worldDemand ?? 0,
        worldDemandAfter: a.worldDemand,
        worldScarcityMoveBefore: scarcityMove(b.worldSupply ?? 0, b.worldDemand ?? 0),
        worldScarcityMoveAfter: scarcityMove(a.worldSupply, a.worldDemand),
        countryScarcityMoveBefore: scarcityMove(b.countrySupply ?? 0, b.countryDemand ?? 0),
        countryScarcityMoveAfter: scarcityMove(a.countrySupply, a.countryDemand),
      };
    });
  // Every real plant's revenue and profit, before and after: who the pass helps or hurts.
  const byPlant = (r: Result) =>
    new Map(r.producers.map((p) => [p.id, { revenue: p.revenue ?? 0, profit: p.profit ?? 0 }]));
  const pb = byPlant(base);
  const pa = byPlant(on);
  const plants = {
    count: pb.size,
    revenueBefore: 0,
    revenueAfter: 0,
    profitBefore: 0,
    profitAfter: 0,
    worseByOver1Pct: 0,
    worseLoss: 0,
    betterByOver1Pct: 0,
    betterGain: 0,
    worstByCountry: {} as Record<string, { plants: number; loss: number }>,
  };
  for (const [id, b] of pb) {
    const a = pa.get(id) ?? { revenue: 0, profit: 0 };
    plants.revenueBefore += b.revenue;
    plants.revenueAfter += a.revenue;
    plants.profitBefore += b.profit;
    plants.profitAfter += a.profit;
    const d = a.revenue - b.revenue;
    if (d < -0.01 * Math.abs(b.revenue)) {
      plants.worseByOver1Pct++;
      plants.worseLoss += d;
      const c = plantCountry.get(id) ?? "";
      const row = (plants.worstByCountry[c] ||= { plants: 0, loss: 0 });
      row.plants++;
      row.loss += d;
    } else if (d > 0.01 * Math.abs(b.revenue)) {
      plants.betterByOver1Pct++;
      plants.betterGain += d;
    }
  }
  const total = (r: Result) => r.accounts.reduce((sum, a) => sum + a.cash, 0);
  const opening = (q: Request) => q.accounts.reduce((sum, a) => sum + a.cash, 0);
  process.stdout.write(
    JSON.stringify(
      {
        turn: request.turn,
        country: COUNTRY,
        seededLines: {
          buyers: req.residualOrders?.length ?? 0,
          sellers: req.residualOffers?.length ?? 0,
        },
        marketCash: {
          base: { opening: opening(request), closing: total(base) },
          on: { opening: opening(req), closing: total(on) },
        },
        plants,
        rows,
      },
      null,
      1
    )
  );
}

if (process.env.BOOST) boostMain();
else main();
