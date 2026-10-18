import { describe, it, expect } from "vitest";
import {
  advanceSectorInventory,
  INVENTORY_DRAIN_RATE_PER_TURN,
  INVENTORY_CARRY_COST_RATE_PER_TURN,
  type InventoryTurnInput,
} from "./sectorInventory";
import { COMMODITY_SPOILAGE_PER_TURN } from "@/lib/market/inventory";
import { COMMODITY_BASE_PRICES } from "@/lib/constants/commodities";

const base = (over: Partial<InventoryTurnInput> = {}): InventoryTurnInput => ({
  inventory: {},
  stockpileEnabled: true,
  producedUnits: 1000,
  soldUnits: 600,
  soldFraction: 0.6,
  soldByCommodity: {},
  supplyRates: { iron: 0.4 },
  mixPriceAnchor: 50,
  ...over,
});

describe("advanceSectorInventory", () => {
  it("accrues the unsold remainder of a storable output", () => {
    const r = advanceSectorInventory(base());
    expect(r.accruedUnits).toBeCloseTo(400, 5);
    expect(r.nextInventory.iron).toBeCloseTo(400, 5);
    expect(r.drainedUnits).toBe(0);
  });

  it("accrues nothing with the toggle off, but an existing pile still spoils", () => {
    const r = advanceSectorInventory(base({ stockpileEnabled: false, inventory: { iron: 100 } }));
    expect(r.accruedUnits).toBe(0);
    const spoil = COMMODITY_SPOILAGE_PER_TURN.iron;
    expect(r.nextInventory.iron).toBeCloseTo(100 * (1 - spoil), 5);
  });

  it("never stores a non-storable output", () => {
    const r = advanceSectorInventory(base({ supplyRates: { freight: 0.45 } }));
    expect(r.accruedUnits).toBe(0);
    expect(r.nextInventory.freight).toBeUndefined();
  });

  it("sells down only when the fresh offer fully cleared, at the drain cap", () => {
    const held = 1000;
    const spoil = COMMODITY_SPOILAGE_PER_TURN.iron;
    const notCleared = advanceSectorInventory(
      base({ inventory: { iron: held }, soldFraction: 0.9, soldUnits: 900 })
    );
    expect(notCleared.drainedUnits).toBe(0);
    const cleared = advanceSectorInventory(
      base({ inventory: { iron: held }, soldFraction: 1, soldUnits: 1000 })
    );
    const afterSpoil = held * (1 - spoil);
    expect(cleared.drainedUnits).toBeCloseTo(afterSpoil * INVENTORY_DRAIN_RATE_PER_TURN, 5);
    expect(cleared.drainedRevenueAnchor).toBeCloseTo(cleared.drainedUnits * 50, 5);
  });

  it("charges carrying cost on the held pile", () => {
    const r = advanceSectorInventory(base({ soldFraction: 0.6 }));
    expect(r.carryCostAnchor).toBeCloseTo(r.heldUnits * 50 * INVENTORY_CARRY_COST_RATE_PER_TURN, 5);
  });

  it("splits accrual by per-commodity sold fractions when clearing itemized them", () => {
    // Two outputs with equal unit weight: iron cleared fully, coal barely.
    const r = advanceSectorInventory(
      base({
        supplyRates: { iron: 0.4, coal: 0.4 * (COMMODITY_SPOILAGE_PER_TURN.coal < 1 ? 1 : 1) },
        soldByCommodity: { iron: 1, coal: 0.2 },
        producedUnits: 1000,
        soldUnits: 600,
        soldFraction: 0.6,
      })
    );
    expect(r.nextInventory.iron ?? 0).toBe(0);
    expect(r.nextInventory.coal ?? 0).toBeGreaterThan(0);
  });

  it("uses exact product output quantities and nominal value per commodity", () => {
    const r = advanceSectorInventory(
      base({
        producedUnits: 6,
        soldUnits: 3,
        soldFraction: 0.5,
        soldByCommodity: { steel: 0.25, building_materials: 0.75 },
        outputUnitsByCommodity: { steel: 2, building_materials: 4 },
        outputAnchorByCommodity: { steel: 200, building_materials: 100 },
      })
    );

    expect(r.nextInventory.steel).toBeCloseTo(1.5, 6);
    expect(r.nextInventory.building_materials).toBeCloseTo(1, 6);
    expect(r.accruedUnits).toBeCloseTo(2.5, 6);
    expect(r.heldValueAnchor).toBeCloseTo(175, 6);
    expect(r.carryCostAnchor).toBeCloseTo(175 * INVENTORY_CARRY_COST_RATE_PER_TURN, 6);
  });

  it("values a retooled extraction pile at each commodity's own price", () => {
    // A coal mine retooled to rare earth. The old coal in the pile must not
    // inherit the new rare-earth mix price, which is what made a six-commodity
    // pile read as hundreds of times its real value.
    const mixPriceAnchor = COMMODITY_BASE_PRICES.rare_earth / 0.72;
    const r = advanceSectorInventory(
      base({
        inventory: { coal: 1000, rare_earth: 10 },
        stockpileEnabled: false,
        producedUnits: 100,
        soldUnits: 100,
        soldFraction: 1,
        soldByCommodity: {},
        supplyRates: { rare_earth: 0.72 },
        mixPriceAnchor,
      })
    );

    // One output unit of the current strategy prices every held ton at that
    // commodity's own base price on the same unit basis: base / Σrate.
    const coalAnchor = COMMODITY_BASE_PRICES.coal / 0.72;
    const rareAnchor = COMMODITY_BASE_PRICES.rare_earth / 0.72;
    const coalAfterSpoilage = 1000 * (1 - COMMODITY_SPOILAGE_PER_TURN.coal);
    const rareAfterSpoilage = 10 * (1 - COMMODITY_SPOILAGE_PER_TURN.rare_earth);
    const coalDrained = coalAfterSpoilage * INVENTORY_DRAIN_RATE_PER_TURN;
    const rareDrained = rareAfterSpoilage * INVENTORY_DRAIN_RATE_PER_TURN;

    expect(r.drainedRevenueAnchor).toBeCloseTo(
      coalDrained * coalAnchor + rareDrained * rareAnchor,
      4
    );
    expect(r.heldValueAnchor).toBeCloseTo(
      (coalAfterSpoilage - coalDrained) * coalAnchor +
        (rareAfterSpoilage - rareDrained) * rareAnchor,
      4
    );
    // The old uniform mix price valued all 1,010 tons at the rare-earth unit
    // price; the pile is now a small fraction of that.
    expect(r.heldValueAnchor).toBeLessThan(1000 * mixPriceAnchor * 0.02);
  });

  it("keeps the blended mix price when the sector has no priced output mix", () => {
    // No supply rates means no per-commodity basis to derive; behaviour must
    // stay exactly as before for such a sector.
    const mixPriceAnchor = 300;
    const r = advanceSectorInventory(
      base({
        inventory: { coal: 1000 },
        stockpileEnabled: false,
        producedUnits: 0,
        soldUnits: 0,
        soldFraction: 1,
        soldByCommodity: {},
        supplyRates: {},
        mixPriceAnchor,
      })
    );
    const afterSpoilage = 1000 * (1 - COMMODITY_SPOILAGE_PER_TURN.coal);
    expect(r.drainedRevenueAnchor).toBeCloseTo(
      afterSpoilage * INVENTORY_DRAIN_RATE_PER_TURN * mixPriceAnchor,
      4
    );
    expect(r.heldValueAnchor).toBeCloseTo(
      afterSpoilage * (1 - INVENTORY_DRAIN_RATE_PER_TURN) * mixPriceAnchor,
      4
    );
  });

  it("holding forever loses money against selling (carry + spoilage are net-negative EV)", () => {
    // One unit held one turn costs carry + spoilage of its value; selling now
    // yields its value. The hoard EV must be strictly below the sell EV.
    const spoil = COMMODITY_SPOILAGE_PER_TURN.iron;
    const holdOneTurnValue = (1 - spoil) * (1 - INVENTORY_CARRY_COST_RATE_PER_TURN);
    expect(holdOneTurnValue).toBeLessThan(1);
  });
});
