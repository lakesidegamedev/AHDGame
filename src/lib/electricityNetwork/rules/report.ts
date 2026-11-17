/** Human-readable electricity comparisons use the same frozen market inputs and common-value money. */
import type { ProducerEconomyResult } from "@/lib/market/producerMarket/productionTypes";
import { producerTrades } from "@/lib/market/producerMarket/producerQuotes";
import { createGridLedger } from "./paths";
import type { ElectricityNetwork, ElectricityNetworkMode } from "./types";
export interface GridFigures {
  delivered: number;
  dispatched: number;
  losses: number;
  tradeValue: number;
  averagePrice: number;
  sitesProducingLess: number;
}
export interface GridCompanyRow {
  corporationId: string;
  revenueOff: number;
  revenueGrid: number;
  profitOff: number;
  profitGrid: number;
  powerOff: number;
  powerGrid: number;
  energyRevenueOff: number;
  energyRevenueGrid: number;
}
export interface GridSiteRow {
  id: string;
  corporationId: string;
  sectorType: string;
  countryId: string;
  stateId: string;
  outputOff: number;
  outputGrid: number;
  powerOff: number;
  powerGrid: number;
  revenueOff: number;
  revenueGrid: number;
  profitOff: number;
  profitGrid: number;
}
export interface GridRouteRow {
  from: string;
  to: string;
  fromState: string;
  toState: string;
  unitsOff: number;
  unitsGrid: number;
  connected: boolean;
}
export interface ElectricityReport {
  version: string;
  year: number;
  mode: ElectricityNetworkMode;
  status: "complete" | "planning-limit" | "unavailable";
  reason?: string;
  notes: readonly string[];
  off: GridFigures | null;
  grid: GridFigures | null;
  companies: GridCompanyRow[];
  sites: GridSiteRow[];
  routes: GridRouteRow[];
  lines: ProducerEconomyResult["electricity"];
  omitted: { sites: number; routes: number; companies: number };
  planning?: {
    offPasses: number;
    gridPasses: number;
    offConverged: boolean;
    gridConverged: boolean;
  };
}
interface Target {
  producerId: string;
  corporationId: string;
  plantType: { sectorType: string };
}
const emptyFigures = (): GridFigures => ({
  delivered: 0,
  dispatched: 0,
  losses: 0,
  tradeValue: 0,
  averagePrice: 0,
  sitesProducingLess: 0,
});
function energy(result: ProducerEconomyResult) {
  const receipt = result.tradeReceipt;
  const orders = receipt.orders.filter((o) => o.commodity === "energy");
  const ids = new Set(orders.map((o) => o.id));
  const energyReceipt = {
    ...receipt,
    orders,
    offers: receipt.offers.filter((o) => o.commodity === "energy"),
    fills: receipt.fills.filter((f) => ids.has(f.orderId)),
  };
  const figures = emptyFigures(),
    received = new Map<string, number>(),
    income = new Map<string, number>(),
    sites = new Map<string, number>(),
    routes = new Map<string, GridRouteRow>();
  let sold = 0;
  const byOrder = new Map(orders.map((o) => [o.id, o]));
  const byOffer = new Map(energyReceipt.offers.map((o) => [o.id, o]));
  for (const t of producerTrades(energyReceipt)) {
    figures.delivered += t.units;
    figures.dispatched += t.dispatchedUnits ?? t.units;
    figures.tradeValue += t.amount;
    if (t.kind === "sale") sold += t.units;
    received.set(t.buyerAccountId, (received.get(t.buyerAccountId) ?? 0) + t.units);
    income.set(t.sellerAccountId, (income.get(t.sellerAccountId) ?? 0) + t.amount);
    const o = byOrder.get(t.orderId)!;
    const offer = byOffer.get(t.offerId)!;
    try {
      let parts = JSON.parse(o.id);
      if (parts[1] === "reservation") parts = JSON.parse(parts[0]);
      if (parts[1] === "input") sites.set(parts[0], (sites.get(parts[0]) ?? 0) + t.units);
    } catch {
      /* Public orders have no plant id. */
    }
    const row = {
      from: t.sellerCountry ?? "",
      to: t.buyerCountry ?? "",
      fromState: offer.stateId ?? "",
      toState: o.stateId ?? "",
      unitsOff: 0,
      unitsGrid: 0,
      connected: false,
    };
    const key = JSON.stringify([row.from, row.to, row.fromState, row.toState]);
    const existing = routes.get(key) ?? row;
    existing.unitsOff += t.units;
    routes.set(key, existing);
  }
  figures.losses = Math.max(0, figures.dispatched - figures.delivered);
  figures.averagePrice = sold > 0 ? figures.tradeValue / sold : 0;
  return { figures, received, income, sites, routes };
}
export function electricityReport(
  network: ElectricityNetwork,
  off: ProducerEconomyResult,
  grid: ProducerEconomyResult | null,
  targets: readonly Target[],
  reason?: string
): ElectricityReport {
  const before = energy(off),
    after = grid ? energy(grid) : null;
  const targetById = new Map(targets.map((t) => [t.producerId, t]));
  const beforeResults = new Map(off.producers.map((p) => [p.id, p]));
  const afterResults = new Map(grid?.producers.map((p) => [p.id, p]) ?? []);
  const companies = new Map<string, GridCompanyRow>();
  const locations = new Map<string, { countryId?: string; stateId?: string }>();
  for (const o of [...off.tradeReceipt.offers, ...off.tradeReceipt.orders]) {
    try {
      let p = JSON.parse(o.id);
      if (p[1] === "reservation") p = JSON.parse(p[0]);
      if (p[1] === "input" || p[1] === "output") locations.set(p[0], o);
    } catch {
      /* Public wallets have no plant id. */
    }
  }
  const sites: GridSiteRow[] = [];
  let less = 0;
  for (const [id, b] of beforeResults) {
    const t = targetById.get(id);
    if (!t) continue;
    const a = afterResults.get(id);
    const location = locations.get(id);
    const row: GridSiteRow = {
      id,
      corporationId: t.corporationId,
      sectorType: t.plantType.sectorType,
      countryId: location?.countryId ?? "",
      stateId: location?.stateId ?? "",
      outputOff: b.producedUnits,
      outputGrid: a?.producedUnits ?? 0,
      powerOff: before.sites.get(id) ?? 0,
      powerGrid: after?.sites.get(id) ?? 0,
      revenueOff: b.revenue,
      revenueGrid: a?.revenue ?? 0,
      profitOff: b.profit,
      profitGrid: a?.profit ?? 0,
    };
    if (a && a.producedUnits < b.producedUnits - Math.max(1e-8, b.producedUnits * 1e-8)) less++;
    if (row.powerOff || row.powerGrid || t.plantType.sectorType === "energy") sites.push(row);
    const c = companies.get(t.corporationId) ?? {
      corporationId: t.corporationId,
      revenueOff: 0,
      revenueGrid: 0,
      profitOff: 0,
      profitGrid: 0,
      powerOff: 0,
      powerGrid: 0,
      energyRevenueOff: 0,
      energyRevenueGrid: 0,
    };
    c.revenueOff += row.revenueOff;
    c.revenueGrid += row.revenueGrid;
    c.profitOff += row.profitOff;
    c.profitGrid += row.profitGrid;
    companies.set(t.corporationId, c);
  }
  for (const [id, c] of companies) {
    c.powerOff = before.received.get(id) ?? 0;
    c.powerGrid = after?.received.get(id) ?? 0;
    c.energyRevenueOff = before.income.get(id) ?? 0;
    c.energyRevenueGrid = after?.income.get(id) ?? 0;
  }
  const ledger = createGridLedger(network);
  const routes = new Map(before.routes);
  for (const [key, row] of after?.routes ?? []) {
    const entry = routes.get(key) ?? { ...row, unitsOff: 0 };
    entry.unitsGrid = row.unitsOff;
    routes.set(key, entry);
  }
  for (const r of routes.values())
    r.connected = !!ledger.path(
      { countryId: r.from, stateId: r.fromState },
      { countryId: r.to, stateId: r.toState }
    );
  const siteRows = sites.sort(
    (a, b) =>
      Math.abs(b.revenueGrid - b.revenueOff) - Math.abs(a.revenueGrid - a.revenueOff) ||
      a.id.localeCompare(b.id)
  );
  const companyRows = [...companies.values()].sort(
    (a, b) =>
      Math.abs(b.revenueGrid - b.revenueOff) - Math.abs(a.revenueGrid - a.revenueOff) ||
      a.corporationId.localeCompare(b.corporationId)
  );
  const routeRows = [...routes.values()].sort(
    (a, b) => b.unitsOff - a.unitsOff || a.from.localeCompare(b.from)
  );
  if (after) after.figures.sitesProducingLess = less;
  return {
    version: network.version,
    year: network.year,
    mode: network.mode,
    status: !grid
      ? "unavailable"
      : off.planning?.converged === false || grid.planning?.converged === false
        ? "planning-limit"
        : "complete",
    ...(reason ? { reason } : {}),
    notes: [
      ...network.notes,
      "Counterfactuals hold starting cash, inventory, staffing, bids and other rules fixed. They do not forecast later turns or change any live balance.",
      "Production uses the existing make-do input-shortage rules, including minor-input premiums. This is not a model of mandatory electrical shutdowns.",
      "Prices and money use the market anchor value. Quantities are market MWh; different sector output units must not be added together.",
    ],
    off: before.figures,
    grid: after?.figures ?? null,
    companies: companyRows.slice(0, 500),
    sites: siteRows.slice(0, 1000),
    routes: routeRows.slice(0, 500),
    lines: grid?.electricity,
    omitted: {
      companies: Math.max(0, companyRows.length - 500),
      sites: Math.max(0, siteRows.length - 1000),
      routes: Math.max(0, routeRows.length - 500),
    },
    ...(grid
      ? {
          planning: {
            offPasses: off.planning?.passes ?? 0,
            gridPasses: grid.planning?.passes ?? 0,
            offConverged: off.planning?.converged ?? true,
            gridConverged: grid.planning?.converged ?? true,
          },
        }
      : {}),
  };
}
