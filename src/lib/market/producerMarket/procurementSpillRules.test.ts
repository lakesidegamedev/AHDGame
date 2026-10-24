import { describe, expect, it } from "vitest";
import { procurementSpill } from "./procurementSpillRules";

const wallet = (accountId: string, countryId: string, wageBill: number) => ({
  accountId,
  countryId,
  wageBill,
});

describe("procurement spill", () => {
  it("pays nothing when the share is zero or the pool is empty", () => {
    const wallets = [wallet("hh:US:a", "US", 10)];
    expect(procurementSpill({ poolByCountry: new Map([["US", 100]]), wallets, share: 0 })).toEqual(
      []
    );
    expect(procurementSpill({ poolByCountry: new Map([["US", 0]]), wallets, share: 1 })).toEqual(
      []
    );
  });

  it("splits a country's pool across its own households by wage bill and never across borders", () => {
    const out = procurementSpill({
      poolByCountry: new Map([
        ["US", 100],
        ["JP", 50],
      ]),
      wallets: [
        wallet("hh:US:a", "US", 30),
        wallet("hh:US:b", "US", 10),
        wallet("hh:UK:a", "UK", 99),
      ],
      share: 1,
    });
    expect(out.map((p) => p.accountId)).toEqual(["hh:US:a", "hh:US:b"]);
    expect(out[0].amountAnchor).toBeCloseTo(75, 6);
    expect(out[1].amountAnchor).toBeCloseTo(25, 6);
    expect(out.every((p) => p.countryId === "US")).toBe(true);
  });

  it("never pays more than the share of the pool", () => {
    const out = procurementSpill({
      poolByCountry: new Map([["US", 1 / 3]]),
      wallets: [wallet("a", "US", 1), wallet("b", "US", 1), wallet("c", "US", 1)],
      share: 1,
    });
    const total = out.reduce((s, p) => s + p.amountAnchor, 0);
    expect(total).toBeLessThanOrEqual(1 / 3);
    expect(total).toBeCloseTo(1 / 3, 9);
  });

  it("splits evenly when no wallet has wages and scales by the share", () => {
    const out = procurementSpill({
      poolByCountry: new Map([["US", 100]]),
      wallets: [wallet("a", "US", 0), wallet("b", "US", 0)],
      share: 0.5,
    });
    expect(out.map((p) => p.amountAnchor).map((v) => +v.toFixed(6))).toEqual([25, 25]);
  });
});
