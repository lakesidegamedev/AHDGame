import { describe, expect, it } from "vitest";
import { lawSpendingCategory, otherRevenueParts, otherSpendingParts } from "./otherLineBreakdown";

describe("lawSpendingCategory", () => {
  it("books an uncategorised law into other, as the spending total does", () => {
    expect(lawSpendingCategory("")).toBe("other");
    expect(lawSpendingCategory(undefined)).toBe("other");
    expect(lawSpendingCategory("education")).toBe("education");
  });
});

describe("otherSpendingParts", () => {
  it("lists each law largest first and books the rest as spending without a law", () => {
    const parts = otherSpendingParts({
      total: 1_000,
      laws: [
        { title: "Small Grants Act", amount: 100 },
        { title: "Space Programme Act", amount: 300 },
      ],
    });
    expect(parts.map((p) => [p.label, p.amount])).toEqual([
      ["Space Programme Act", 300],
      ["Small Grants Act", 100],
      ["General spending not tied to a law", 600],
    ]);
  });

  it("itemises nothing when live law costs sum past the booked line", () => {
    expect(
      otherSpendingParts({
        total: 1_000,
        laws: [
          { title: "Space Programme Act", amount: 700 },
          { title: "Small Grants Act", amount: 400 },
        ],
      })
    ).toEqual([]);
  });

  it("itemises nothing when a law saves money, since positive rows could not add up", () => {
    expect(
      otherSpendingParts({
        total: 1_000,
        laws: [
          { title: "Space Programme Act", amount: 300 },
          { title: "Efficiency Act", amount: -50 },
        ],
      })
    ).toEqual([]);
  });

  it("never shows a negative part", () => {
    const parts = otherSpendingParts({
      total: 1_000,
      laws: [{ title: "Space Programme Act", amount: 1_000.4 }],
    });
    expect(parts.every((p) => p.amount > 0)).toBe(true);
  });

  it("adds up to the line it explains", () => {
    const parts = otherSpendingParts({
      total: 777,
      laws: [
        { title: "A", amount: 120 },
        { title: "B", amount: 57 },
      ],
    });
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(777, 9);
  });

  it("skips laws without a usable cost", () => {
    const parts = otherSpendingParts({
      total: 500,
      laws: [
        { title: "No cost", amount: undefined },
        { title: "Bad cost", amount: Number.NaN },
        { title: "Zero", amount: 0 },
      ],
    });
    expect(parts).toEqual([
      expect.objectContaining({ label: "General spending not tied to a law", amount: 500 }),
    ]);
  });

  it("adds no remainder row when the laws account for the whole line", () => {
    const parts = otherSpendingParts({ total: 400, laws: [{ title: "A", amount: 400 }] });
    expect(parts.map((p) => p.label)).toEqual(["A"]);
  });

  it("is empty for an empty line", () => {
    expect(otherSpendingParts({ total: 0, laws: [{ title: "A", amount: 10 }] })).toEqual([]);
  });
});

describe("otherRevenueParts", () => {
  it("names both sources the stored sum holds", () => {
    const [part] = otherRevenueParts({ total: 14_450 });
    expect(part.amount).toBe(14_450);
    expect(part.label).toContain("Fees");
    expect(part.label).toContain("state company profits");
  });

  it("is empty for an empty line", () => {
    expect(otherRevenueParts({ total: 0 })).toEqual([]);
  });
});
