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
