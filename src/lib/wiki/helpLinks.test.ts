import { describe, expect, it } from "vitest";
import { WIKI_SEED_PAGES } from "@/lib/seeds/wiki/pages";
import { extractWikiHeadings } from "./headings";
import { WIKI_HELP_TARGETS, wikiHelpHref, type WikiHelpScreen } from "./helpLinks";

const slugs = new Set(WIKI_SEED_PAGES.map((page) => page.slug));

describe("wiki help link map", () => {
  const entries = Object.entries(WIKI_HELP_TARGETS) as [
    WikiHelpScreen,
    { slug: string; anchor?: string },
  ][];

  it.each(entries)("%s points at an existing wiki page", (_screen, target) => {
    expect(slugs.has(target.slug)).toBe(true);
  });

  it("only uses anchors that exist as headings on the target page", () => {
    for (const [, target] of entries) {
      if (!target.anchor) continue;
      const page = WIKI_SEED_PAGES.find((p) => p.slug === target.slug);
      expect(extractWikiHeadings(page?.content ?? "").map((h) => h.id)).toContain(target.anchor);
    }
  });

  it("builds relative hrefs", () => {
    expect(wikiHelpHref("poll")).toBe("/wiki/granular-polling");
  });
});
