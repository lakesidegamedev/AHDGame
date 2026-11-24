import { describe, expect, it } from "vitest";
import { annotatePartialWordMatch, titleHasQueryWord } from "./partialWordMatch";
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

  it("says when only the description or full text matched", () => {
    const withText = { ...bill("Labour"), subtitle: "Wages and margins" };
    expect(annotatePartialWordMatch(withText, "margin").subtitle).toBe(
      'Wages and margins · matched in description: "margins"'
    );
    expect(annotatePartialWordMatch(bill("Labour"), "margin").subtitle).toBe(
      "Nigeria bill · matched in the full text, not the title"
    );
  });

  it("does not double label suggestions", () => {
    const hit = { ...bill("Margin of Victory"), subtitle: "Did you mean this? · Wiki" };
    expect(annotatePartialWordMatch(hit, "margn").subtitle).toBe("Did you mean this? · Wiki");
  });

  it("detects titles that carry the typed words", () => {
    expect(titleHasQueryWord("Marginal Tax", "Margin")).toBe(true);
    expect(titleHasQueryWord("Labour", "Margin")).toBe(false);
    expect(titleHasQueryWord("Selina Meyer", "Selina Myer")).toBe(false);
  });
});
