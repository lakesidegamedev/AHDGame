import { describe, expect, it, vi } from "vitest";
import { isRealPoliticianName } from "./realPoliticianNames";
import { generateUniqueNPPNameAndGender } from "./nameGenerator";

describe("real politician names", () => {
  it("matches regardless of case, punctuation and suffix", () => {
    expect(isRealPoliticianName("David Duke")).toBe(true);
    expect(isRealPoliticianName("david  duke jr.")).toBe(true);
    expect(isRealPoliticianName("Jean Chrétien")).toBe(true);
    expect(isRealPoliticianName("Erin O'Toole")).toBe(true);
    expect(isRealPoliticianName("David Dingleberry")).toBe(false);
  });

  it("makes the generator draw again instead of returning a real politician", () => {
    // The first draw lands on David Duke, the second on an ordinary name.
    const draws = [0.9, 0, 0, 0.9, 0.5, 0.5, 0.9];
    const spy = vi.spyOn(Math, "random");
    let calls = 0;
    spy.mockImplementation(() => draws[calls++ % draws.length]!);
    const seen: string[] = [];
    for (let i = 0; i < 50; i++) {
      const result = generateUniqueNPPNameAndGender([], 20, "US");
      if (result) seen.push(result.name);
    }
    spy.mockRestore();
    expect(seen.some((name) => isRealPoliticianName(name))).toBe(false);
  });

  it("never returns a real politician across many US, UK and CA draws", () => {
    for (const country of ["US", "UK", "CA"]) {
      for (let i = 0; i < 2000; i++) {
        const result = generateUniqueNPPNameAndGender([], 100, country);
        expect(result && isRealPoliticianName(result.name)).toBeFalsy();
      }
    }
  });
});
