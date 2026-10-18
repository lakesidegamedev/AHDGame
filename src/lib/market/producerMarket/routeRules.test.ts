import { describe, expect, it } from "vitest";
import { routeEligibility, tariffTransfers } from "./routeRules";

describe("route eligibility", () => {
  const offers = [
    { id: "us-iron", commodity: "iron", sellerCountry: "US" },
    { id: "ru-iron", commodity: "iron", sellerCountry: "RU" },
    { id: "jp-iron", commodity: "iron", sellerCountry: "JP" },
    { id: "us-coal", commodity: "coal", sellerCountry: "US" },
  ];
  // US-RU embargoed both ways for iron.
  const open = (c: string, from: string, to: string) =>
    !(c === "iron" && ((from === "RU" && to === "US") || (from === "US" && to === "RU")));

  it("lets a buyer reach its own country and open routes only", () => {
    const e = routeEligibility(
      [
        { id: "a", commodity: "iron", buyerCountry: "US" },
        { id: "b", commodity: "iron", buyerCountry: "JP" },
      ],
      offers,
      open
    );
    expect([...e.a].sort()).toEqual(["jp-iron", "us-iron"]);
    expect([...e.b].sort()).toEqual(["jp-iron", "ru-iron", "us-iron"]);
  });

  it("spare home output can reach a short foreign buyer", () => {
    const e = routeEligibility([{ id: "jp", commodity: "iron", buyerCountry: "JP" }], offers, open);
    expect(e.jp).toContain("us-iron");
  });

  it("never mixes commodities and shares one list per commodity and country", () => {
    const e = routeEligibility(
      [
        { id: "x", commodity: "coal", buyerCountry: "JP" },
        { id: "y", commodity: "coal", buyerCountry: "JP" },
      ],
      offers,
      open
    );
    expect(e.x).toEqual(["us-coal"]);
    expect(e.x).toBe(e.y);
  });
});

describe("tariff transfers", () => {
  const mult = (_c: string, _from: string, to: string) => (to === "JP" ? 1.1 : 1);
  const treasury = (c: string) => `treasury:${c}`;

  it("charges the importer's tariff on cross-border sales to its treasury", () => {
    const t = tariffTransfers(
      [
        {
          buyerAccountId: "hh-jp",
          buyerCountry: "JP",
          sellerCountry: "US",
          commodity: "iron",
          value: 100,
        },
        {
          buyerAccountId: "hh-jp",
          buyerCountry: "JP",
          sellerCountry: "JP",
          commodity: "iron",
          value: 999,
        },
        {
          buyerAccountId: "hh-us",
          buyerCountry: "US",
          sellerCountry: "JP",
          commodity: "iron",
          value: 50,
        },
      ],
      mult,
      treasury,
      () => 1e9
    );
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ fromAccountId: "hh-jp", toAccountId: "treasury:JP" });
    expect(t[0].amount).toBeCloseTo(10, 9);
  });

  it("never charges more than the buyer has", () => {
    const t = tariffTransfers(
      [
        {
          buyerAccountId: "b",
          buyerCountry: "JP",
          sellerCountry: "US",
          commodity: "iron",
          value: 1000,
        },
      ],
      mult,
      treasury,
      () => 30
    );
    expect(t[0].amount).toBe(30);
  });
});
