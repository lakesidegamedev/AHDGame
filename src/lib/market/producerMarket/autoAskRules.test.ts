import { describe, expect, it } from "vitest";
import {
  AUTO_ASK_DEFAULT_STEP,
  AUTO_ASK_MAX_STEP,
  nextAutoAsk,
  sellThroughRatio,
} from "./autoAskRules";

const memory = { ask: 100, previousAsk: 95 };

describe("auto ask sell-through controller", () => {
  it("raises the ask one step when the last ask sold out", () => {
    const decision = nextAutoAsk({ memory, soldUnits: 500, offeredUnits: 500 });
    expect(decision).toEqual({
      ask: 100 * (1 + AUTO_ASK_DEFAULT_STEP),
      action: "raise",
      sellThrough: 1,
    });
  });

  it("treats fractional unit arithmetic at the boundary as a sell-out", () => {
    const decision = nextAutoAsk({
      memory,
      soldUnits: 499.9999999999,
      offeredUnits: 500,
    });
    expect(decision?.action).toBe("raise");
  });

  it("holds inside the deadband instead of chasing noise", () => {
    const decision = nextAutoAsk({ memory, soldUnits: 95, offeredUnits: 100 });
    expect(decision).toEqual({ ask: 100, action: "hold", sellThrough: 0.95 });
  });

  it("reverts to the previous ask below the revert floor", () => {
    const decision = nextAutoAsk({ memory, soldUnits: 89, offeredUnits: 100 });
    expect(decision).toEqual({ ask: 95, action: "revert", sellThrough: 0.89 });
  });

  it("reverts all the way on no sales at all", () => {
    const decision = nextAutoAsk({ memory, soldUnits: 0, offeredUnits: 100 });
    expect(decision?.ask).toBe(95);
    expect(decision?.action).toBe("revert");
  });

  it("never reverts upward when the stored previous ask is above the current ask", () => {
    const decision = nextAutoAsk({
      memory: { ask: 100, previousAsk: 140 },
      soldUnits: 10,
      offeredUnits: 100,
    });
    expect(decision?.ask).toBe(100);
    expect(decision?.action).toBe("hold");
  });

  it("falls back to holding when the revert target is missing", () => {
    const decision = nextAutoAsk({
      memory: { ask: 100, previousAsk: Number.NaN },
      soldUnits: 10,
      offeredUnits: 100,
    });
    expect(decision?.ask).toBe(100);
    expect(decision?.action).toBe("hold");
  });

  it("holds the ask when nothing was offered, without reading it as zero sales", () => {
    const decision = nextAutoAsk({ memory, soldUnits: 0, offeredUnits: 0 });
    expect(decision).toEqual({ ask: 100, action: "hold", sellThrough: null });
  });

  it("holds when the readings are not finite", () => {
    const decision = nextAutoAsk({ memory, soldUnits: 10, offeredUnits: Number.NaN });
    expect(decision).toEqual({ ask: 100, action: "hold", sellThrough: null });
  });

  it("returns null when there is no usable memory", () => {
    expect(nextAutoAsk({ memory: null, soldUnits: 1, offeredUnits: 1 })).toBeNull();
    expect(
      nextAutoAsk({ memory: { ask: 0, previousAsk: 0 }, soldUnits: 1, offeredUnits: 1 })
    ).toBeNull();
  });

  it("clamps a raise to the ceiling and reports holding there", () => {
    const decision = nextAutoAsk({
      memory,
      soldUnits: 100,
      offeredUnits: 100,
      ceiling: 100,
    });
    expect(decision?.ask).toBe(100);
    expect(decision?.action).toBe("hold");
  });

  it("clamps a revert to the floor", () => {
    const decision = nextAutoAsk({
      memory: { ask: 100, previousAsk: 60 },
      soldUnits: 10,
      offeredUnits: 100,
      floor: 80,
    });
    expect(decision?.ask).toBe(80);
    expect(decision?.action).toBe("revert");
  });

  it("raises but never past the ceiling when the step would overshoot", () => {
    const decision = nextAutoAsk({
      memory,
      soldUnits: 100,
      offeredUnits: 100,
      ceiling: 102,
    });
    expect(decision?.ask).toBe(102);
    expect(decision?.action).toBe("raise");
  });

  it("caps the configured step", () => {
    const decision = nextAutoAsk({ memory, soldUnits: 100, offeredUnits: 100, step: 5 });
    expect(decision?.ask).toBe(100 * (1 + AUTO_ASK_MAX_STEP));
  });

  it("rejects a nonsensical step", () => {
    expect(() =>
      nextAutoAsk({ memory, soldUnits: 100, offeredUnits: 100, step: Number.NaN })
    ).toThrow("Invalid auto ask step");
    expect(() => nextAutoAsk({ memory, soldUnits: 100, offeredUnits: 100, step: -0.1 })).toThrow(
      "Invalid auto ask step"
    );
  });

  it("walks a rejected raise back over two turns instead of compounding it", () => {
    const first = nextAutoAsk({ memory, soldUnits: 100, offeredUnits: 100 });
    expect(first?.action).toBe("raise");

    const second = nextAutoAsk({
      memory: { ask: first!.ask, previousAsk: memory.ask },
      soldUnits: 50,
      offeredUnits: 100,
    });
    expect(second?.action).toBe("revert");
    expect(second?.ask).toBe(memory.ask);
  });
});

describe("sellThroughRatio", () => {
  it("is null when nothing was offered", () => {
    expect(sellThroughRatio(10, 0)).toBeNull();
  });

  it("is zero when nothing sold", () => {
    expect(sellThroughRatio(0, 10)).toBe(0);
  });

  it("is capped at one", () => {
    expect(sellThroughRatio(20, 10)).toBe(1);
  });
});
