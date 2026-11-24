/**
 * Offline what-if for the seeded "wider economy": replays one settled turn's
 * producer market with a seeded supplier and a seeded buyer in every US and
 * Canadian state, and compares the result with the unchanged replay.
 *
 *   REQUEST=<request.json> STATES=<states.json> npx tsx scripts/sim/wideEconomySupplyReplay.ts
 *
 * Reads two local files; touches no database.
 */
import fs from "node:fs";
import { advanceProducerEconomy } from "@/lib/market/producerMarket/production";

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const request: Json = JSON.parse(fs.readFileSync(process.env.REQUEST!, "utf8"));
const states: { id: string; countryId: string; gdpAnchor: number }[] = JSON.parse(
  fs.readFileSync(process.env.STATES!, "utf8")
);

const isSeeded = (id: string) => id.startsWith('["wide-sim"');

function summarize(req: Json, result: Json) {
  const goods: Record<string, Json> = {};
  const g = (c: string) =>
    (goods[c] ||= {
      plantOffered: 0,
      plantSold: 0,
      plantRevenue: 0,
      realRequested: 0,
      realDelivered: 0,
      seededBought: 0,
      seededSold: 0,
    });
  for (const p of result.producers ?? [])
    for (const x of p.products ?? []) {
      const r = g(x.commodity);
      r.plantOffered += x.offeredUnits ?? 0;
      r.plantSold += x.soldUnits ?? 0;
      r.plantRevenue += x.revenue ?? 0;
    }
  for (const o of result.orderOutcomes ?? []) {
    const r = g(o.commodity);
    if (isSeeded(o.accountId)) r.seededBought += o.deliveredUnits;
    else {
      r.realRequested += o.requestedUnits;
      r.realDelivered += o.deliveredUnits;
    }
  }
  let seededSales = 0;
  for (const a of result.accounts ?? [])
    if (String(a.id).startsWith('["wide-sim","seller"')) seededSales += a.cash ?? 0;
  goods.__seededSales = { revenue: seededSales };
  void req;
  return goods;
}

function run(req: Json) {
  const result = advanceProducerEconomy(JSON.parse(JSON.stringify(req)));
  return { result, goods: summarize(req, result) };
}

/** The goods whose orders or outputs sit on a state book. */
function stateScopedGoods(req: Json): Set<string> {
  const scoped = new Set<string>();
  for (const o of req.externalOrders ?? [])
    if (String(o.book).startsWith("state:")) scoped.add(o.commodity);
  for (const p of req.producers ?? [])
    for (const out of p.outputs ?? [])
      if (String(out.book).startsWith("state:")) scoped.add(out.commodity);
  return scoped;
}

function seeded(
  base: Json,
  baseGoods: Record<string, Json>,
  normalPrice: Record<string, number>,
  opts: { scale: number; markup: number; bid: number; headroom: number; exclude: Set<string> }
) {
  const req = JSON.parse(JSON.stringify(base));
  const scoped = stateScopedGoods(req);
  const total = states.reduce((s, x) => s + x.gdpAnchor, 0);
  const buyerCash = new Map<string, number>();
  for (const [commodity, r] of Object.entries(baseGoods)) {
    if (opts.exclude.has(commodity)) continue;
    const price = normalPrice[commodity];
    const realDemand = r.realRequested as number;
    if (!(price > 0) || !(realDemand > 0)) continue;
    const supplyUnits = opts.scale * realDemand;
    // Demand-only mode (scale 0): the shipped buyer, sized to 1.1x everything offered minus demand.
    const offered =
      (r.plantOffered as number) +
      (base.externalOffers ?? [])
        .filter((o: Json) => o.commodity === commodity)
        .reduce((sum: number, o: Json) => sum + (o.units ?? 0), 0);
    const demandOnlyUnits = Math.max(0, opts.headroom * offered - realDemand);
    for (const s of states) {
      const share = s.gdpAnchor / total;
      if (!(share > 0)) continue;
      const book = scoped.has(commodity) ? `state:${s.id}` : "world";
      const sellerId = JSON.stringify(["wide-sim", "seller", s.countryId]);
      const buyerId = JSON.stringify(["wide-sim", "buyer", s.countryId]);
      if (opts.scale > 0) req.externalOffers.push({
        id: JSON.stringify(["wide-sim", "offer", s.id, commodity]),
        accountId: sellerId,
        commodity,
        book,
        units: supplyUnits * share,
        unitPrice: price * opts.markup,
        countryId: s.countryId,
        stateId: s.id,
      });
      const units = opts.scale > 0 ? opts.headroom * supplyUnits * share : demandOnlyUnits * share;
      if (!(units > 0)) continue;
      req.externalOrders.push({
        id: JSON.stringify(["wide-sim", "order", s.id, commodity]),
        accountId: buyerId,
        commodity,
        book,
        units,
        maximumUnitPrice: price * opts.bid,
        maximumSpend: units * price * opts.bid,
        countryId: s.countryId,
        demandStep: 1,
      });
      buyerCash.set(buyerId, (buyerCash.get(buyerId) ?? 0) + units * price * opts.bid);
    }
  }
  const have = new Set(req.accounts.map((a: Json) => a.id));
  for (const country of ["US", "CA"]) {
    const sellerId = JSON.stringify(["wide-sim", "seller", country]);
    const buyerId = JSON.stringify(["wide-sim", "buyer", country]);
    if (!have.has(sellerId)) req.accounts.push({ id: sellerId, cash: 0 });
    if (!have.has(buyerId)) req.accounts.push({ id: buyerId, cash: buyerCash.get(buyerId) ?? 0 });
  }
  return req;
}

function main() {
  const base = run(request);
  // Normal price: the good's average plant sale price this turn, else its
  // world clearing price.
  const normalPrice: Record<string, number> = {};
  for (const [c, r] of Object.entries(base.goods))
    if (r.plantSold > 0) normalPrice[c] = r.plantRevenue / r.plantSold;
  const scenarios = (process.env.SCENARIOS ?? "0.25:1.05,0.5:1.05,0.5:1.25")
    .split(",")
    .map((s) => s.split(":").map(Number));
  const exclude = new Set((process.env.EXCLUDE ?? "ordnance").split(",").filter(Boolean));
  const out: Json = { turn: request.turn, base: base.goods, normalPrice, scenarios: [] };
  for (const [scale, markup, bid] of scenarios) {
    const req = seeded(request, base.goods, normalPrice, {
      scale: scale!,
      markup: markup!,
      bid: bid ?? 1,
      headroom: 1.1,
      exclude,
    });
    const r = run(req);
    out.scenarios.push({ scale, markup, bid: bid ?? 1, goods: r.goods });
  }
  process.stdout.write(JSON.stringify(out));
}

main();
