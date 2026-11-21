import { describe, expect, it } from "vitest";
import { settleProducerMarket, producerTrades } from "@/lib/market/producerMarket/rules";
import { companyFlows, producerSiteId } from "./flows";
import { supplyChainRows } from "./view";
import type { SupplyChainFilters } from "../types";
const id = (site: string, side: string, good = "steel") => JSON.stringify([site, side, good]);
const sites = [
  { id: "CT", countryId: "US", stateId: "CT", sectorType: "agriculture" },
  { id: "AZ", countryId: "US", stateId: "AZ", sectorType: "manufacturing" },
  { id: "ON", countryId: "CA", stateId: "CA_ON", sectorType: "extraction" },
];
const filters: SupplyChainFilters = {
  country: "",
  state: "",
  type: "",
  sector: "",
  mode: "",
  view: "company",
};
function market() {
  return settleProducerMarket({
    turn: 4,
    ownSitesFirst: true,
    accounts: [
      { id: "company", cash: 100 },
      { id: "supplier-a", cash: 0 },
      { id: "supplier-b", cash: 0 },
      { id: "customer", cash: 100 },
    ],
    offers: [
      {
        id: id("SA", "output"),
        accountId: "supplier-a",
        commodity: "steel",
        book: "world",
        units: 10,
        unitPrice: 2,
        countryId: "US",
        stateId: "CT",
      },
      {
        id: id("SB", "output"),
        accountId: "supplier-b",
        commodity: "steel",
        book: "world",
        units: 10,
        unitPrice: 2,
        countryId: "US",
        stateId: "AZ",
      },
      {
        id: id("ON", "output"),
        accountId: "company",
        commodity: "steel",
        book: "world",
        units: 3,
        unitPrice: 1,
        countryId: "CA",
        stateId: "CA_ON",
      },
      {
        id: id("CT", "output", "food"),
        accountId: "company",
        commodity: "food",
        book: "world",
        units: 20,
        unitPrice: 3,
        countryId: "US",
        stateId: "CT",
      },
    ],
    orders: [
      {
        id: id("AZ", "input"),
        accountId: "company",
        commodity: "steel",
        book: "world",
        units: 6,
        maximumUnitPrice: 2,
        countryId: "US",
        stateId: "AZ",
        fairShare: true,
      },
      {
        id: id("customer-site", "input", "food"),
        accountId: "customer",
        commodity: "food",
        book: "world",
        units: 10,
        maximumUnitPrice: 3,
        countryId: "US",
        stateId: "CT",
      },
    ],
  });
}
describe("supply-chain attribution", () => {
  it("preserves exact replay while selecting a company's trades", () => {
    const result = market();
    for (const account of ["company", "supplier-a", "supplier-b", "customer", "unrelated"]) {
      expect([...producerTrades(result.tradeReceipt, account)]).toEqual(
        [...producerTrades(result.tradeReceipt)].filter(
          (t) => t.buyerAccountId === account || t.sellerAccountId === account
        )
      );
    }
  });
  it("keeps open-market suppliers, customer sales and internal site legs separate", () => {
    const result = market();
    const flows = companyFlows(result.tradeReceipt, "company", sites);
    const purchases = flows.filter((f) => f.direction === "suppliers" && f.mode !== "internal");
    expect(new Set(purchases.map((f) => f.counterpartyId))).toEqual(
      new Set(["supplier-a", "supplier-b"])
    );
    expect(purchases.reduce((s, f) => s + f.amount, 0)).toBeCloseTo(6);
    expect(
      flows
        .filter((f) => f.direction === "customers" && f.mode !== "internal")
        .reduce((s, f) => s + f.amount, 0)
    ).toBeCloseTo(30);
    expect(
      flows
        .filter((f) => f.mode === "internal")
        .map((f) => [f.direction, f.site.id, f.units, f.amount])
    ).toEqual(
      expect.arrayContaining([
        ["suppliers", "AZ", 3, 0],
        ["customers", "ON", 3, 0],
      ])
    );
    expect(result.accounts.find((a) => a.id === "company")?.cash).toBeCloseTo(124);
  });
  it("filters the company's own sites before grouping", () => {
    const flows = companyFlows(market().tradeReceipt, "company", sites);
    for (const f of [
      { ...filters, country: "CA" },
      { ...filters, state: "CA_ON" },
      { ...filters, type: "extraction" },
      { ...filters, sector: "ON" },
    ]) {
      const rows = supplyChainRows(flows, f);
      expect(rows).toHaveLength(1);
      expect(rows[0].direction).toBe("customers");
      expect(rows[0].mode).toBe("internal");
    }
    expect(supplyChainRows(flows, { ...filters, country: "FR" })).toEqual([]);
    expect(
      supplyChainRows(flows, { ...filters, mode: "open-market" }).every(
        (f) => f.mode === "open-market"
      )
    ).toBe(true);
    expect(supplyChainRows(flows, { ...filters, view: "sites" }).every((f) => !!f.site)).toBe(true);
  });
  it("identifies contract reservations and retains the receiving site", () => {
    const receipt = market().tradeReceipt;
    const base = id("AZ", "input");
    const reservation = JSON.stringify([base, "reservation", "agreement-1"]);
    const result = settleProducerMarket({
      turn: 5,
      accounts: [
        { id: "company", cash: 50 },
        { id: "supplier-a", cash: 0 },
      ],
      offers: [receipt.offers[0]],
      orders: [
        {
          id: reservation,
          accountId: "company",
          commodity: "steel",
          book: "world",
          units: 2,
          maximumUnitPrice: 2,
          supplierOfferId: receipt.offers[0].id,
          contractUnitPrice: 2,
        },
      ],
    });
    expect(companyFlows(result.tradeReceipt, "company", sites)[0]).toMatchObject({
      mode: "agreement",
      site: { id: "AZ" },
      units: 2,
      amount: 4,
    });
    expect(producerSiteId("not-an-id")).toBeNull();
  });
  it("matches unrestricted and routed replay through competing fills", () => {
    let seed = 9;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    for (let run = 0; run < 30; run++) {
      const accounts = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, cash: 100 }));
      const offers = Array.from({ length: 12 }, (_, i) => ({
        id: `o${i}`,
        accountId: accounts[next() % 5].id,
        commodity: "goods",
        book: "world",
        units: next() % 20,
        unitPrice: 1 + (next() % 3),
      }));
      const orders = Array.from({ length: 10 }, (_, i) => ({
        id: `b${i}`,
        accountId: accounts[next() % 5].id,
        commodity: "goods",
        book: "world",
        units: next() % 20,
        maximumUnitPrice: 3,
        ...(i % 3 === 0
          ? { eligibleOfferIds: offers.filter((_, j) => j % 2 === 0).map((o) => o.id) }
          : {}),
      }));
      const result = settleProducerMarket({ turn: run, accounts, offers, orders });
      const all = [...producerTrades(result.tradeReceipt)];
      for (const a of accounts)
        expect([...producerTrades(result.tradeReceipt, a.id)]).toEqual(
          all.filter((t) => t.buyerAccountId === a.id || t.sellerAccountId === a.id)
        );
    }
  });
});
