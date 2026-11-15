import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ERA_FLAVOR_CARDS, FLAVOR_CARD_PORTRAITS, getEraFlavorCards } from "./flavorCards";

describe("FLAVOR_CARD_PORTRAITS", () => {
  it("lists only portraits that ship with the repo", () => {
    for (const slug of FLAVOR_CARD_PORTRAITS) {
      const file = path.join(process.cwd(), "public/static/flavor-cards", `${slug}.webp`);
      expect(existsSync(file), slug).toBe(true);
    }
  });

  it("covers every portrait the repo ships that a card uses", () => {
    const used = new Set(
      Object.values(ERA_FLAVOR_CARDS).flatMap((cards) => cards.map((c) => c.imageSlug))
    );
    for (const slug of used) {
      const file = path.join(process.cwd(), "public/static/flavor-cards", `${slug}.webp`);
      if (existsSync(file)) expect(FLAVOR_CARD_PORTRAITS.has(slug), slug).toBe(true);
    }
  });
});

describe("2027 flavor cards", () => {
  const cards = getEraFlavorCards(2027);

  it("are 2027's own briefs, not the 1979 fallback", () => {
    expect(cards).toBe(ERA_FLAVOR_CARDS["2027"]);
    expect(cards.map((c) => c.name)).toEqual([
      "Automation and work",
      "An ageing population",
      "Climate pressure",
      "Cyber operations",
      "Canada and Quebec",
      "The calendar to 2050",
    ]);
  });

  it("are briefs with no portrait, since every 2027 politician is fictional", () => {
    for (const card of cards) {
      expect(card.kind, card.id).toBe("brief");
      expect(FLAVOR_CARD_PORTRAITS.has(card.imageSlug), card.id).toBe(false);
      const year = Number(card.year);
      expect(year, card.id).toBeGreaterThanOrEqual(2027);
      expect(year, card.id).toBeLessThanOrEqual(2050);
    }
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
  });

  it("keep em and en dashes out", () => {
    for (const card of cards) {
      for (const text of [card.name, card.title, card.country, card.quote]) {
        expect(text, card.id).not.toMatch(/[\u2013\u2014]/);
      }
    }
  });
});
