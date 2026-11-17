import { describe, expect, it } from "vitest";
import { reanchoredOrder } from "./2026-11-17-linear-build-delivery";
import { deliveredFraction } from "@/lib/corporations/buildDelivery";
import type { SectorBuildOrder } from "@/lib/db/types";

const order = (o: Record<string, unknown>) =>
  ({ unitsOrdered: 100, costPaidAnchor: 1000, startTurn: 0, onlineTurn: 10, ...o }) as never;

describe("linear build delivery re-anchor", () => {
  it("leaves an already linear smooth order alone", () => {
    expect(reanchoredOrder(order({ smooth: true }), 4)).toBeNull();
  });

  it("gives a one-plant order no credit it has not earned, then ramps the rest", () => {
    const o = order({ smooth: true, plantUnits: 100 });
    const next = reanchoredOrder(o, 4)!;
    expect(next).toEqual({ startTurn: 4, deliveryBaseFraction: 0 });
    const moved = { ...(o as object), ...next } as SectorBuildOrder;
    expect(deliveredFraction(moved, 4)).toBe(0);
    expect(deliveredFraction(moved, 5)).toBeCloseTo(1 / 6, 9);
    expect(deliveredFraction(moved, 10)).toBe(1);
  });

  it("keeps what the step curve already landed and never delivers it twice", () => {
    const o = order({ smooth: true, plantUnits: 25 });
    const next = reanchoredOrder(o, 5)!;
    expect(next.deliveryBaseFraction).toBe(0.5);
    const moved = { ...(o as object), ...next } as SectorBuildOrder;
    expect(deliveredFraction(moved, 5)).toBe(0.5);
    expect(deliveredFraction(moved, 6)).toBeCloseTo(0.6, 9);
    expect(deliveredFraction(moved, 10)).toBe(1);
  });

  it("converts a legacy all-at-once order that has delivered nothing", () => {
    const next = reanchoredOrder(order({}), 3)!;
    expect(next).toEqual({ startTurn: 3, deliveryBaseFraction: 0 });
  });

  it("does not credit an order placed after the settled turn", () => {
    expect(reanchoredOrder(order({ startTurn: 8, plantUnits: 100, smooth: true }), 5)).toEqual({
      startTurn: 8,
      deliveryBaseFraction: 0,
    });
  });

  it("skips landed and already re-anchored orders", () => {
    expect(reanchoredOrder(order({ onlineTurn: 5 }), 5)).toBeNull();
    expect(reanchoredOrder(order({ deliveryBaseFraction: 0.2 }), 4)).toBeNull();
    expect(reanchoredOrder(order({ deliveryBaseFraction: 0 }), 4)).toBeNull();
  });
});
