import { describe, expect, it } from "vitest";
import { annotatePartialWordMatch } from "./partialWordMatch";
import type { SearchResult } from "./types";

const bill = (title: string): SearchResult => ({
  type: "bill",
  id: "1",
  title,
  subtitle: "Nigeria bill",
  href: "/x",
});

describe("annotatePartialWordMatch", () => {
  it("names the longer word a partial hit matched", () => {
    expect(annotatePartialWordMatch(bill("Marginal Tax Rate 24%"), "Margin").subtitle).toBe(
      'Nigeria bill · partial match: "Marginal"'
    );
  });

  it("leaves whole-word and exact hits alone", () => {
    expect(annotatePartialWordMatch(bill("Margin Call"), "margin").subtitle).toBe("Nigeria bill");
  });

  it("leaves hits whose title does not contain the query alone", () => {
    expect(annotatePartialWordMatch(bill("Labour"), "margin").subtitle).toBe("Nigeria bill");
  });
});
