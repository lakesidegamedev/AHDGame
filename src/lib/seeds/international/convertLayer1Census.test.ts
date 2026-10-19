import { describe, expect, it } from "vitest";
import { convertLayer1Census } from "./convertLayer1Census";

const region = () => ({
  ethnicity: { majority: 0, minority: -0 },
  age: { young: -1, senior: NaN },
  education: { university: Infinity },
  income: { low: 50 },
  urbanization: { urban: 75 },
});

describe("convertLayer1Census", () => {
  it("returns an empty census for an empty input", () => {
    expect(convertLayer1Census({})).toEqual({});
  });

  it("retains raw values and dimension references inside fresh region wrappers", () => {
    const source = { first: region(), second: region() };
    const before = structuredClone(source);
    const first = convertLayer1Census(source);
    const second = convertLayer1Census(source);
    expect(first).toEqual(source);
    expect(source).toEqual(before);
    expect(first).not.toBe(source);
    expect(first.first).not.toBe(source.first);
    expect(first.first).not.toBe(second.first);
    for (const key of Object.keys(source.first) as Array<keyof typeof source.first>) {
      expect(first.first[key]).toBe(source.first[key]);
      expect(second.first[key]).toBe(source.first[key]);
    }
    expect(Object.is(first.first.ethnicity.minority, -0)).toBe(true);
  });

  it("keeps own region IDs and order, including __proto__, and selects only model dimensions", () => {
    const source = Object.assign(Object.create({ inherited: region() }), {
      z: { ...region(), metadata: { population: 100 } },
      a: region(),
    }) as Record<string, ReturnType<typeof region>>;
    Object.defineProperty(source, "__proto__", { value: region(), enumerable: true });
    const result = convertLayer1Census(source);
    expect(Object.keys(result)).toEqual(["z", "a", "__proto__"]);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, "__proto__")).toBe(true);
    expect(Object.keys(result.z)).toEqual([
      "ethnicity",
      "age",
      "education",
      "income",
      "urbanization",
    ]);
    expect(result.z).not.toHaveProperty("metadata");
    expect(result).not.toHaveProperty("inherited");
  });
});
