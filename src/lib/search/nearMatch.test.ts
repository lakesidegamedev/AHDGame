import { describe, expect, it } from "vitest";
import { nearMatchScore, nearMatches } from "./nearMatch";

describe("nearMatches", () => {
  const names = [{ name: "Selina Meyer" }, { name: "Grace Santos" }, { name: "Sean Oppenheimer" }];

  it("finds a name one letter off", () => {
    expect(nearMatches("Selina Myer", names, 5).map((n) => n.name)).toEqual(["Selina Meyer"]);
  });

  it("matches a single misspelled word against any word of the name", () => {
    expect(nearMatches("Oppenhiemer", names, 5).map((n) => n.name)).toEqual(["Sean Oppenheimer"]);
    expect(nearMatches("Oppenheimr", names, 5).map((n) => n.name)).toEqual(["Sean Oppenheimer"]);
  });

  it("does not match unrelated or very short queries", () => {
    expect(nearMatchScore("Margin", "Selina Meyer")).toBeNull();
    expect(nearMatchScore("Se", "Sean")).toBeNull();
  });
});

describe("suggestion vocabulary names", () => {
  it("finds a page for a one letter typo and a swapped name", () => {
    const names = [{ name: "Margin of Victory" }, { name: "Selina Meyer" }, { name: "Labour" }];
    expect(nearMatches("Margn", names, 5).map((n) => n.name)).toEqual(["Margin of Victory"]);
    expect(nearMatches("Selina Myer", names, 5).map((n) => n.name)).toEqual(["Selina Meyer"]);
  });
});

describe("typos at the start of a longer word", () => {
  it("finds a word that begins with the misspelled query", () => {
    const names = [{ name: "Top Marginal Income Tax" }, { name: "Martin Lockheed" }];
    expect(nearMatches("Margn", names, 5).map((n) => n.name)[0]).toBe("Top Marginal Income Tax");
  });

  it("ranks a whole-word match ahead of a prefix match", () => {
    expect(nearMatchScore("Margn", "Margin")!).toBeLessThan(nearMatchScore("Margn", "Marginal")!);
  });

  it("keeps short queries strict", () => {
    expect(nearMatchScore("Mar", "Marginal")).toBeNull();
  });
});
