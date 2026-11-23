import { describe, expect, it } from "vitest";
import { axisTickFormatter } from "./axisTicks";

const ticks = (min: number, max: number) =>
  Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);

describe("axisTickFormatter", () => {
  it("keeps compact labels on a wide range", () => {
    const values = ticks(100_000, 900_000);
    const format = axisTickFormatter(values, "$");
    expect(format(values[0])).toBe("$100K");
  });

  it("never repeats a label on a narrow range", () => {
    const values = ticks(463_900, 464_100);
    const labels = values.map(axisTickFormatter(values, "$"));
    expect(new Set(labels).size).toBe(5);
  });

  it("falls back to decimals when whole numbers still collide", () => {
    const values = ticks(10, 11);
    const labels = values.map(axisTickFormatter(values, "$"));
    expect(new Set(labels).size).toBe(5);
  });
});
