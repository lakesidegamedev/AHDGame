import { describe, expect, it } from "vitest";
import { buildTradeAffinity } from "@/lib/trade/tradeAffinity";
import type { TradeEmbargo } from "@/lib/db/types/tradeEmbargo";
import { tradeEligibilityScope } from "@/lib/turn/corporation/rules/tradeEligibilityScope";
import { routeEligibility } from "./routeRules";

/**
 * Proves the two halves meet: the affinity graph the trade system builds from a
 * real embargo document, and the eligibility list the producer market derives
 * from it. This is the behavior a modern world was missing, because the whole
 * graph used to live behind `eraUnitScale !== 1`.
 */

const offers = [
  { id: "us-iron", commodity: "iron", sellerCountry: "US" },
  { id: "jp-iron", commodity: "iron", sellerCountry: "JP" },
  { id: "fr-iron", commodity: "iron", sellerCountry: "FR" },
];

function embargo(overrides: Partial<TradeEmbargo>): TradeEmbargo {
  return {
    _id: "embargo" as unknown as TradeEmbargo["_id"],
    sourceCountry: "US",
    targetCountry: "JP",
    commodity: "iron",
    direction: "export",
    mode: "block",
    origin: "legislation",
    createdTurn: 1,
    createdBy: "author" as unknown as TradeEmbargo["createdBy"],
    ...overrides,
  } as TradeEmbargo;
}

function eligibleFor(embargoes: TradeEmbargo[], buyerCountry: string): string[] {
  const { affinityFor } = buildTradeAffinity({
    ftaPairs: new Set<string>(),
    blocsByCountry: new Map<string, ReadonlySet<string>>(),
    tariffs: [],
    embargoes,
  });
  const eligibility = routeEligibility(
    [{ id: "order", commodity: "iron", buyerCountry }],
    offers,
    (commodity, from, to) => affinityFor(commodity as never, from as never, to as never) > 0
  );
  return [...eligibility.order].sort();
}

describe("a modern world keeps one book but an embargo still binds", () => {
  it("builds route eligibility for an embargo world even at era unit scale 1", () => {
    expect(tradeEligibilityScope({ eraUnitScale: 1, activeEmbargoCount: 1 }).routes).toBe(true);
    expect(tradeEligibilityScope({ eraUnitScale: 1, activeEmbargoCount: 1 }).countryBooks).toBe(
      false
    );
  });

  it("keeps every seller eligible when no embargo is in force", () => {
    expect(eligibleFor([], "US")).toEqual(["fr-iron", "jp-iron", "us-iron"]);
    expect(eligibleFor([], "JP")).toEqual(["fr-iron", "jp-iron", "us-iron"]);
  });

  it("stops the embargoing country's exports from reaching the target", () => {
    const sanctioned = [embargo({ direction: "export" })];
    expect(eligibleFor(sanctioned, "JP")).toEqual(["fr-iron", "jp-iron"]);
  });

  it("leaves the target free to sell to and buy from other countries", () => {
    const sanctioned = [embargo({ direction: "export" })];
    expect(eligibleFor(sanctioned, "FR")).toEqual(["fr-iron", "jp-iron", "us-iron"]);
    expect(eligibleFor(sanctioned, "US")).toEqual(["fr-iron", "jp-iron", "us-iron"]);
  });

  it("closes both directions when the embargo is two-way", () => {
    const sanctioned = [embargo({ direction: "both" })];
    expect(eligibleFor(sanctioned, "JP")).not.toContain("us-iron");
    expect(eligibleFor(sanctioned, "US")).not.toContain("jp-iron");
  });

  it("honours an all-commodity block", () => {
    const sanctioned = [embargo({ commodity: "all" })];
    expect(eligibleFor(sanctioned, "JP")).toEqual(["fr-iron", "jp-iron"]);
  });
});
