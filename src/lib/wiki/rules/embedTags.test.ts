import { describe, expect, it } from "vitest";
import { expandWikiTags, parseInfobox, parsePartySeatsId } from "./embedTags";

describe("expandWikiTags", () => {
  it("turns a tag line into a widget block", () => {
    expect(expandWikiTags("Intro\n{{election:665f1c2e9a3b4c0012ab34cd}}\nOutro")).toBe(
      "Intro\n```wiki-election\n665f1c2e9a3b4c0012ab34cd\n```\nOutro"
    );
  });

  it("builds an infobox from key=value pairs", () => {
    const out = expandWikiTags("{{infobox:politician|Name=Ada Lane|Party=Civic Union}}");
    expect(parseInfobox(out.split("\n").slice(1, -1).join("\n"))).toEqual({
      type: "politician",
      rows: [
        { label: "Name", value: "Ada Lane" },
        { label: "Party", value: "Civic Union" },
      ],
    });
  });

  it("leaves unknown tags and fenced code alone", () => {
    expect(expandWikiTags("{{other:1}}")).toBe("{{other:1}}");
    const fenced = "```\n{{stock:1}}\n```";
    expect(expandWikiTags(fenced)).toBe(fenced);
  });

  it("cannot break out of the fence with backticks", () => {
    const out = expandWikiTags("{{infobox:party|Name=a```b}}");
    expect(out.split("```").length).toBe(3);
  });
});

describe("parsePartySeatsId", () => {
  it("reads country and number", () => {
    expect(parsePartySeatsId("us-3")).toEqual({ countryId: "US", sequentialId: 3 });
    expect(parsePartySeatsId("3")).toBeNull();
  });
});
