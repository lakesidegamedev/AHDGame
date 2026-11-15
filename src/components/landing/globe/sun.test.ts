import { describe, expect, it } from "vitest";
import { daylight, smoothstep, subsolarPoint } from "./sun";

describe("subsolarPoint", () => {
  it("sits near the equator and the prime meridian at noon UTC on the March equinox", () => {
    const [lon, lat] = subsolarPoint(new Date("2026-03-20T12:00:00Z"));
    expect(Math.abs(lat)).toBeLessThan(1.5);
    expect(Math.abs(lon)).toBeLessThan(5);
  });

  it("moves west as the day goes on, about 15 degrees an hour", () => {
    const [a] = subsolarPoint(new Date("2026-03-20T12:00:00Z"));
    const [b] = subsolarPoint(new Date("2026-03-20T15:00:00Z"));
    expect(a - b).toBeCloseTo(45, 0);
  });

  it("reaches the tropics at the solstices", () => {
    expect(subsolarPoint(new Date("2026-06-21T12:00:00Z"))[1]).toBeGreaterThan(23);
    expect(subsolarPoint(new Date("2026-12-21T12:00:00Z"))[1]).toBeLessThan(-23);
  });

  it("wraps longitude into -180..180", () => {
    for (const hour of [0, 6, 18, 23]) {
      const [lon] = subsolarPoint(new Date(Date.UTC(2026, 10, 14, hour)));
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
    }
  });
});

describe("daylight", () => {
  it("is full day, full night, and one smooth band between", () => {
    expect(daylight(1)).toBe(1);
    expect(daylight(-1)).toBe(0);
    const samples = [-0.34, -0.2, -0.1, 0, 0.1].map(daylight);
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeGreaterThan(samples[i - 1]);
  });

  it("smoothstep clamps", () => {
    expect(smoothstep(0, 1, -5)).toBe(0);
    expect(smoothstep(0, 1, 5)).toBe(1);
  });
});
