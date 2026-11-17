import { describe, it, expect, vi, afterEach } from "vitest";
import { advanceProducerEconomy } from "@/lib/market/producerMarket/production";
import type { ProducerEconomyInput } from "@/lib/market/producerMarket/productionTypes";
import { compareElectricity } from "./comparison";
vi.mock("@/lib/market/producerMarket/production", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/market/producerMarket/production")>();
  return { ...actual, advanceProducerEconomy: vi.fn(actual.advanceProducerEconomy) };
});
afterEach(() => vi.clearAllMocks());
const fixture = (): ProducerEconomyInput => ({
  turn: 1,
  accounts: [
    { id: "seller", cash: 0 },
    { id: "buyer", cash: 100 },
  ],
  producers: [],
  externalOffers: [
    {
      id: "source",
      accountId: "seller",
      commodity: "energy",
      book: "world",
      countryId: "US",
      units: 20,
      unitPrice: 1,
    },
  ],
  externalOrders: [
    {
      id: "demand",
      accountId: "buyer",
      commodity: "energy",
      book: "world",
      countryId: "JP",
      units: 20,
      maximumUnitPrice: 2,
    },
  ],
  electricityNetwork: { version: "test", year: 2027, mode: "shadow", notes: [], links: [] },
});
describe("read-only electricity comparison", () => {
  it("runs the same frozen inputs and leaves actual cash, inventory and receipt unchanged", () => {
    const input = fixture(),
      actual = advanceProducerEconomy(input),
      saved = structuredClone(actual),
      opening = structuredClone(input);
    const report = compareElectricity(input, actual, []);
    expect(report?.off?.delivered).toBe(20);
    expect(report?.grid?.delivered).toBe(0);
    expect(actual).toEqual(saved);
    expect(input).toEqual(opening);
  });
  it.each(["shadow", "enforced"] as const)(
    "keeps the actual %s side when the counterfactual is unavailable",
    (mode) => {
      const input = fixture();
      input.electricityNetwork!.mode = mode;
      const actual = advanceProducerEconomy(input);
      vi.mocked(advanceProducerEconomy).mockImplementationOnce(() => {
        throw Error("Synthetic counterfactual failure");
      });
      const report = compareElectricity(input, actual, []);
      expect(report?.status).toBe("unavailable");
      expect(report?.companies).toEqual([]);
      expect(mode === "enforced" ? report?.off : report?.grid).toBeNull();
      expect(mode === "enforced" ? report?.grid : report?.off).not.toBeNull();
    }
  );
  it("does no comparison work in Off", () => {
    const input = fixture();
    input.electricityNetwork!.mode = "off";
    const actual = advanceProducerEconomy(input);
    vi.mocked(advanceProducerEconomy).mockClear();
    expect(compareElectricity(input, actual, [])).toBeUndefined();
    expect(advanceProducerEconomy).not.toHaveBeenCalled();
  });
});
