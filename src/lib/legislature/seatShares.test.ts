import { describe, expect, it } from "vitest";
import { seatSharePercents } from "./seatShares";

const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 10) / 10;

describe("seatSharePercents", () => {
  it("adds up to exactly 100.0 where plain rounding gives 100.1", () => {
    const seats = [1, 1, 1, 1, 1, 1, 1];
    const plain = seats.map((n) => Math.round((n / 7) * 1000) / 10);
    expect(sum(plain)).toBe(100.1);
    expect(sum(seatSharePercents(seats, 7))).toBe(100);
  });

  it("adds up to exactly 100.0 where plain rounding gives 99.9", () => {
    const plain = [1, 1, 1].map((n) => Math.round((n / 3) * 1000) / 10);
    expect(sum(plain)).toBe(99.9);
    expect(seatSharePercents([1, 1, 1], 3)).toEqual([33.4, 33.3, 33.3]);
  });

  it("leaves vacant seats out of the parties' sum", () => {
    const shares = seatSharePercents([30, 20], 100);
    expect(shares).toEqual([30, 20]);
  });

  it("returns zeros for an empty chamber", () => {
    expect(seatSharePercents([0, 0], 0)).toEqual([0, 0]);
  });
});
