import { describe, expect, it } from "vitest";
import {
  STICKY_WAGE_DECLINE_PER_TURN,
  STICKY_WAGE_FLOOR_SHARE,
  stickyWageBill,
} from "./stickyWageRules";

describe("sticky wages", () => {
  it("lets the bill fall only a tenth a turn from last turn's", () => {
    expect(
      stickyWageBill({ computed: 10, previousPaid: 100, fullRunBill: 100, mothballed: false })
    ).toBe(100 * (1 - STICKY_WAGE_DECLINE_PER_TURN));
  });

  it("never drops below half a full run while the plant is open", () => {
    expect(
      stickyWageBill({ computed: 1, previousPaid: 52, fullRunBill: 100, mothballed: false })
    ).toBe(100 * STICKY_WAGE_FLOOR_SHARE);
  });

  it("follows output up at once", () => {
    expect(
      stickyWageBill({ computed: 90, previousPaid: 60, fullRunBill: 100, mothballed: false })
    ).toBe(90);
  });

  it("releases workers fully on mothballing and has no history on the first funded turn", () => {
    expect(
      stickyWageBill({ computed: 0, previousPaid: 80, fullRunBill: 100, mothballed: true })
    ).toBe(0);
    expect(
      stickyWageBill({ computed: 12, previousPaid: undefined, fullRunBill: 100, mothballed: false })
    ).toBe(12);
  });
});
