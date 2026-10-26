import { describe, expect, it } from "vitest";
import { appendToBook, indexRowsById } from "./bookAssembly";

interface Row {
  id: string;
  units: number;
}

/** The implementation `appendToBook` replaces. */
function legacyAppendToBook<K, V>(book: Map<K, V[]>, key: K, value: V): void {
  book.set(key, [...(book.get(key) ?? []), value]);
}

/**
 * A realistic clearing book: 300 sellers over three commodities, keyed by
 * commodity exactly as `computeClearingFactors` keys `sellersByCommodity`.
 */
function fixtureRows(count: number): Row[] {
  const commodities = ["steel", "food", "freight"] as const;
  return Array.from({ length: count }, (_, i) => ({
    id: `${commodities[i % 3]}-6a1f${i.toString(16).padStart(4, "0")}`,
    units: (i % 17) * 1.5,
  }));
}

const bookKey = (row: Row) => row.id.split("-")[0]!;

describe("appendToBook", () => {
  it("builds the same books, in the same order, as the spread form", () => {
    const rows = fixtureRows(300);
    const legacy = new Map<string, Row[]>();
    const current = new Map<string, Row[]>();
    for (const row of rows) {
      legacyAppendToBook(legacy, bookKey(row), row);
      const list = appendToBook(current, bookKey(row), row);
      // The book holds the list that was just appended to, never a copy.
      expect(list).toBe(current.get(bookKey(row)));
    }
    expect([...current.keys()]).toEqual([...legacy.keys()]);
    expect([...current.entries()]).toEqual([...legacy.entries()]);
    expect(current.get("steel")!.length).toBe(100);
  });

  it("copies the growing book once per row in the spread form, not at all here", () => {
    const rows = fixtureRows(300);
    const legacy = new Map<string, Row[]>();
    const current = new Map<string, Row[]>();
    let legacyElementsCopied = 0;
    for (const row of rows) {
      legacyElementsCopied += (legacy.get(bookKey(row))?.length ?? 0) + 1;
      legacyAppendToBook(legacy, bookKey(row), row);
      appendToBook(current, bookKey(row), row);
    }
    const elementsStored = [...current.values()].reduce((n, list) => n + list.length, 0);
    expect(elementsStored).toBe(rows.length);
    // 100 sellers per book: the spread form copies ~5050 elements per book.
    expect(legacyElementsCopied).toBe(3 * ((100 * 101) / 2));
  });
});

describe("indexRowsById", () => {
  it("resolves the same row the linear scan did", () => {
    const rows = fixtureRows(300);
    const byId = indexRowsById(rows);
    for (const row of rows) {
      expect(byId.get(row.id)).toBe(rows.find((candidate) => candidate.id === row.id));
    }
    expect(byId.get("missing")).toBe(rows.find((candidate) => candidate.id === "missing"));
  });

  it("keeps the first row for a duplicate id, as the linear find does", () => {
    const rows = [
      { id: "a", units: 1 },
      { id: "a", units: 2 },
    ];
    expect(indexRowsById(rows).get("a")).toBe(rows.find((row) => row.id === "a"));
    expect(indexRowsById(rows).get("a")!.units).toBe(1);
  });
});
