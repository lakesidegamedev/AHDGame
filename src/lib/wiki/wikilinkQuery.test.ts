import { describe, expect, it } from "vitest";
import { applyWikilink, findWikilinkQuery } from "./wikilinkQuery";

describe("findWikilinkQuery", () => {
  it("finds the text typed after [[", () => {
    expect(findWikilinkQuery("See [[Sen", 9)).toEqual({ start: 4, query: "Sen" });
  });

  it("ignores finished or broken links", () => {
    expect(findWikilinkQuery("See [[Senate]] and", 18)).toBeNull();
    expect(findWikilinkQuery("See [[Sen\nate", 13)).toBeNull();
    expect(findWikilinkQuery("No link here", 5)).toBeNull();
  });
});

describe("applyWikilink", () => {
  it("replaces the query with a markdown link", () => {
    const text = "See [[Sen and more";
    const match = findWikilinkQuery(text, 9)!;
    const out = applyWikilink(text, 9, match, "Senate", "/wiki/senate");
    expect(out.text).toBe("See [Senate](/wiki/senate) and more");
    expect(out.caret).toBe("See [Senate](/wiki/senate)".length);
  });

  it("removes a closing ]] that was already typed", () => {
    const text = "[[Sen]] x";
    const match = findWikilinkQuery(text, 5)!;
    expect(applyWikilink(text, 5, match, "Senate", "/wiki/senate").text).toBe(
      "[Senate](/wiki/senate) x"
    );
  });
});
