import { describe, expect, it } from "vitest";
import {
  AUTO_ASK_DEFAULT_STEP,
  AUTO_ASK_MAX_STEP,
  nextAutoAsk,
  rememberAutoAsk,
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

  it("steps down instead of reverting upward when the stored previous ask is above the current ask", () => {
    const decision = nextAutoAsk({
      memory: { ask: 100, previousAsk: 140 },
      soldUnits: 10,
      offeredUnits: 100,
    });
    expect(decision?.ask).toBeCloseTo(100 / (1 + AUTO_ASK_DEFAULT_STEP));
    expect(decision?.action).toBe("lower");
  });

  it("steps down when the revert target is missing", () => {
    const decision = nextAutoAsk({
      memory: { ask: 100, previousAsk: Number.NaN },
      soldUnits: 10,
      offeredUnits: 100,
    });
    expect(decision?.ask).toBeCloseTo(100 / (1 + AUTO_ASK_DEFAULT_STEP));
    expect(decision?.action).toBe("lower");
  });

  it("keeps lowering through a shortfall that outlasts the last raise", () => {
    let state = { ask: 100, previousAsk: 100 };
    for (let turn = 0; turn < 3; turn++) {
      const decision = nextAutoAsk({ memory: state, soldUnits: 50, offeredUnits: 100 });
      expect(decision?.action).toBe("lower");
      expect(decision!.ask).toBeLessThan(state.ask);
      state = { ask: decision!.ask, previousAsk: state.ask };
    }
    expect(state.ask).toBeCloseTo(100 / (1 + AUTO_ASK_DEFAULT_STEP) ** 3);
  });

  it("holds a shortfall at the floor", () => {
    const decision = nextAutoAsk({
      memory: { ask: 80, previousAsk: 80 },
      soldUnits: 10,
      offeredUnits: 100,
      floor: 80,
    });
    expect(decision).toEqual({ ask: 80, action: "hold", sellThrough: 0.1 });
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

  it("falls back to the default step instead of throwing on a nonsensical step", () => {
    const expected = 100 * (1 + AUTO_ASK_DEFAULT_STEP);
    for (const step of [Number.NaN, Number.POSITIVE_INFINITY, -0.1]) {
      const decision = nextAutoAsk({ memory, soldUnits: 100, offeredUnits: 100, step });
      expect(decision?.ask).toBeCloseTo(expected);
    }
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

describe("clamp label", () => {
  it("labels a ceiling that fell under the remembered ask as a clamp, not a hold", () => {
    expect(nextAutoAsk({ memory, soldUnits: 95, offeredUnits: 100, ceiling: 80 })).toEqual({
      ask: 80,
      action: "clamp",
      sellThrough: 0.95,
    });
  });

  it("labels a floor that rose over the remembered ask as a clamp", () => {
    const d = nextAutoAsk({ memory, soldUnits: 95, offeredUnits: 100, floor: 120 })!;
    expect(d.ask).toBe(120);
    expect(d.action).toBe("clamp");
  });

  it("keeps hold for a sell-out already pinned at an unchanged ceiling", () => {
    const d = nextAutoAsk({ memory, soldUnits: 100, offeredUnits: 100, ceiling: 100 })!;
    expect(d).toEqual({ ask: 100, action: "hold", sellThrough: 1 });
  });

  it("labels a silent turn that only re-applies the ceiling as a clamp", () => {
    const d = nextAutoAsk({ memory, soldUnits: 0, offeredUnits: 0, ceiling: 90 })!;
    expect(d).toEqual({ ask: 90, action: "clamp", sellThrough: null });
  });
});

describe("rememberAutoAsk", () => {
  const sold = (soldUnits: number, mem = memory) =>
    nextAutoAsk({ memory: mem, soldUnits, offeredUnits: 100 })!;

  it("records the ask a raise came from as the revert target", () => {
    const decision = sold(100);
    expect(rememberAutoAsk(memory, decision)).toEqual({
      ask: decision.ask,
      previousAsk: memory.ask,
    });
  });

  it("stores the price actually posted when production marked the ask down", () => {
    expect(rememberAutoAsk(memory, sold(95), 97)).toEqual({ ask: 97, previousAsk: 97 });
    const raise = sold(100);
    expect(rememberAutoAsk(memory, raise, 102)).toEqual({ ask: 102, previousAsk: 100 });
  });

  it("ignores a non-positive posted price and keeps the decided ask", () => {
    expect(rememberAutoAsk(memory, sold(95), 0)).toEqual({ ask: 100, previousAsk: 100 });
  });

  it("confirms the price on a hold, so there is nothing left to revert", () => {
    expect(rememberAutoAsk(memory, sold(95))).toEqual({ ask: 100, previousAsk: 100 });
  });

  it("advances past a revert and a lower", () => {
    const reverted = sold(50);
    expect(reverted.action).toBe("revert");
    expect(rememberAutoAsk(memory, reverted)).toEqual({ ask: 95, previousAsk: 95 });

    const flat = { ask: 100, previousAsk: 100 };
    const lowered = sold(50, flat);
    expect(lowered.action).toBe("lower");
    expect(rememberAutoAsk(flat, lowered)).toEqual({
      ask: lowered.ask,
      previousAsk: lowered.ask,
    });
  });

  it("keeps the revert target through a turn that offered nothing", () => {
    const silent = nextAutoAsk({ memory, soldUnits: 0, offeredUnits: 0 })!;
    expect(rememberAutoAsk(memory, silent)).toEqual(memory);
  });

  it("closes the loop: raise, overshoot, give it back, then step down", () => {
    let mem = { ask: 100, previousAsk: 100 };
    const asks: number[] = [];
    const actions: string[] = [];
    for (const soldUnits of [100, 100, 50, 50, 95]) {
      const decision = sold(soldUnits, mem);
      asks.push(decision.ask);
      actions.push(decision.action);
      mem = rememberAutoAsk(mem, decision);
    }
    const up = 1 + AUTO_ASK_DEFAULT_STEP;
    expect(actions).toEqual(["raise", "raise", "revert", "lower", "hold"]);
    expect(asks[0]).toBeCloseTo(100 * up);
    expect(asks[1]).toBeCloseTo(100 * up * up);
    expect(asks[2]).toBeCloseTo(100 * up);
    expect(asks[3]).toBeCloseTo(100);
    expect(asks[4]).toBeCloseTo(100);
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
