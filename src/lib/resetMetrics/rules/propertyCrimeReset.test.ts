import { describe, expect, it } from "vitest";
import { propertyCrimeOnEraScale } from "./propertyCrimeReset";

describe("property crime on the era scale", () => {
  it("pulls a rate inflated by the old flat scale back toward its opening", () => {
    const value = propertyCrimeOnEraScale(1716, 3057, "US", 2030)!;
    expect(value).toBeLessThan(2300);
    expect(value).toBeGreaterThan(1716);
  });

  it("keeps the direction of movement and leaves an unmoved region alone", () => {
    expect(propertyCrimeOnEraScale(1716, 1716, "US", 2030)).toBeCloseTo(1716, 6);
    expect(propertyCrimeOnEraScale(2000, 1800, "US", 2030)!).toBeLessThan(2000);
  });

  it("applies only where the era scale exists", () => {
    expect(propertyCrimeOnEraScale(1716, 3057, "UK", 2030)).toBeNull();
    expect(propertyCrimeOnEraScale(1858, 3000, "CA", 2030)).not.toBeNull();
  });
});
