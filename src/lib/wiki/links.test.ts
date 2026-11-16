import { describe, expect, it } from "vitest";
import { slugToSearchQuery, toRelativeWikiHref } from "./links";

describe("toRelativeWikiHref", () => {
  it("maps wiki subdomain links onto /wiki", () => {
    expect(toRelativeWikiHref("https://wiki.ahousedividedgame.com/getting-started")).toBe(
      "/wiki/getting-started"
    );
    expect(toRelativeWikiHref("https://wiki.ahousedividedgame.com/")).toBe("/wiki");
    expect(toRelativeWikiHref("https://wiki.ahousedividedgame.com/party/x?country=us#a")).toBe(
      "/wiki/party/x?country=us#a"
    );
  });

  it("keeps main-site wiki links relative", () => {
    expect(toRelativeWikiHref("https://ahousedividedgame.com/wiki/impeachment#senate")).toBe(
      "/wiki/impeachment#senate"
    );
  });

  it("leaves other links alone", () => {
    expect(toRelativeWikiHref("https://docs.lakesidegames.net/x")).toBe(
      "https://docs.lakesidegames.net/x"
    );
    expect(toRelativeWikiHref("/wiki/faq")).toBe("/wiki/faq");
    expect(toRelativeWikiHref("https://ahousedividedgame.com/dashboard")).toBe(
      "https://ahousedividedgame.com/dashboard"
    );
  });
});

describe("slugToSearchQuery", () => {
  it("turns the last path segment into words", () => {
    expect(slugToSearchQuery("/wiki/attack-formula")).toBe("attack formula");
    expect(slugToSearchQuery("/wiki/attack%20formula/")).toBe("attack formula");
    expect(slugToSearchQuery("/")).toBe("");
  });
});
