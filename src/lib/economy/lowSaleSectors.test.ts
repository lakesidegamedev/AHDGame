import { describe, expect, it } from "vitest";
import type { CorporateSector } from "@/lib/db/types";
import { countLowSaleSectors } from "./lowSaleSectors";

const settled = (turn: number, offered: number, sold: number, own = 0) =>
  ({
    turn,
    products: [{ offeredUnits: offered, soldUnits: sold, internalDeliveredUnits: own }],
  }) as unknown as CorporateSector["producerSettlement"];

describe("countLowSaleSectors", () => {
  it("counts a settled sector on its latest sale, not the legacy streak", () => {
    const result = countLowSaleSectors([
      // Legacy streak of 101 while selling everything: not counted.
      { lowFillTurns: 101, soldByCommodityTurn: 108, producerSettlement: settled(108, 20, 20) },
      // Sold 30%, no legacy streak: counted.
      { lowFillTurns: 0, soldByCommodityTurn: 108, producerSettlement: settled(108, 20, 6) },
      // Own-site deliveries were taken too: not counted.
      { lowFillTurns: 20, soldByCommodityTurn: 108, producerSettlement: settled(108, 20, 4, 8) },
    ]);
    expect(result).toEqual({ count: 1, basis: "sector_count_latest_settled_sale_under_half" });
  });

  it("keeps the legacy streak for a sector with no funded record", () => {
    expect(countLowSaleSectors([{ lowFillTurns: 12 }, { lowFillTurns: 11 }])).toEqual({
      count: 1,
      basis: "sector_count_low_fill_12_turns",
    });
  });

  it("falls back to the legacy streak where the settlement is older than the legacy fill", () => {
    expect(
      countLowSaleSectors([
        { lowFillTurns: 14, soldByCommodityTurn: 109, producerSettlement: settled(108, 20, 20) },
        { lowFillTurns: 0, soldByCommodityTurn: 108, producerSettlement: settled(108, 20, 2) },
      ])
    ).toEqual({
      count: 2,
      basis: "sector_count_latest_settled_sale_under_half_or_legacy_low_fill_12_turns",
    });
  });
});
