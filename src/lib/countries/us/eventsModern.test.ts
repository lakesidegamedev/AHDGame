import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { EventDefinition, EventEffect } from "@/lib/db/types/events";
import { packDefinition } from "@/lib/events/pree/packTypes";
import { filterEligibleTemplates } from "@/lib/events/pree/weighting";
import type { CharacterEventContext } from "@/lib/events/pree/eligibility";
import { US_MODERN_PACK } from "./eventsModern";

const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);

const DECADES = [
  ["d2020s", 2027, 2029],
  ["d2030s", 2030, 2039],
  ["d2040s", 2040, 2049],
] as const;

function approved(): EventDefinition[] {
  return US_MODERN_PACK.map((s) => ({
    ...packDefinition(s),
    status: "approved" as const,
    _id: new ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

function ctx(countryId: CountryId): CharacterEventContext {
  return {
    characterId: new ObjectId(),
    countryId,
    isPolitician: true,
    isCeo: true,
    isInElection: true,
  };
}

function effects(spec: (typeof US_MODERN_PACK)[number]): EventEffect[] {
  return spec.options.flatMap((o) => [...(o.high ?? []), ...(o.mid ?? []), ...(o.low ?? [])]);
}

describe("US modern event pack", () => {
  it("has at least ten events per decade and fifteen regional events", () => {
    for (const [label] of DECADES) {
      expect(US_MODERN_PACK.filter((s) => s.kind.startsWith(`pree.us.${label}.`)).length).toBe(12);
    }
    expect(
      US_MODERN_PACK.filter((s) => s.kind.startsWith("pree.us.regional.")).length
    ).toBeGreaterThanOrEqual(15);
  });

  it("uses unique kinds", () => {
    const kinds = US_MODERN_PACK.map((s) => s.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("fires only for the US and only inside each decade", () => {
    for (let year = 2024; year <= 2055; year++) {
      const us = filterEligibleTemplates(approved(), ctx("US"), null, 10, year).map(
        (e) => e.definition.kind
      );
      for (const [label, from, to] of DECADES) {
        const inDecade = us.filter((k) => k.startsWith(`pree.us.${label}.`));
        expect(inDecade.length, `${label} in ${year}`).toBe(year >= from && year <= to ? 12 : 0);
      }
      const regional = us.filter((k) => k.startsWith("pree.us.regional."));
      expect(regional.length > 0, `regional in ${year}`).toBe(year >= 2027);
    }
    const uk = filterEligibleTemplates(approved(), ctx("UK"), null, 10, 2035);
    expect(uk.some((e) => e.definition.kind.startsWith("pree.us."))).toBe(false);
  });

  it("keeps weights, cooldowns, defaults and tiers sane", () => {
    for (const s of US_MODERN_PACK) {
      expect(s.requiresCountryIds, s.kind).toEqual(["US"]);
      expect(s.baseWeight, s.kind).toBeGreaterThan(0);
      expect(s.baseWeight, s.kind).toBeLessThanOrEqual(40);
      expect(s.cooldown?.[0], s.kind).toBeGreaterThanOrEqual(24);
      expect(s.options, s.kind).toHaveLength(3);
      expect(
        s.options.filter((o) => o.isDefault),
        s.kind
      ).toHaveLength(1);
      expect(new Set(s.options.map((o) => o.id)).size, s.kind).toBe(3);
    }
  });

  it("gates role-specific effects to the matching role", () => {
    for (const s of US_MODERN_PACK) {
      const types = new Set(effects(s).map((e) => e.type));
      if (types.has("politicalInfluence")) expect(s.eligibility, s.kind).toEqual(["politician"]);
      if (types.has("corpSentiment")) expect(s.eligibility, s.kind).toEqual(["ceo"]);
    }
  });

  it("only uses small bounded effects", () => {
    for (const s of US_MODERN_PACK) {
      for (const e of effects(s)) {
        if (e.type === "favorability") expect(Math.abs(e.delta), s.kind).toBeLessThanOrEqual(5);
        if (e.type === "infamy") expect(e.delta, s.kind).toBeLessThanOrEqual(3);
        if (e.type === "personalWealth")
          expect(Math.abs(e.deltaAnchor), s.kind).toBeLessThanOrEqual(900);
        if (e.type === "politicalInfluence")
          expect(Math.abs(e.delta), s.kind).toBeLessThanOrEqual(3);
        if (e.type === "corpSentiment") expect(Math.abs(e.delta), s.kind).toBeLessThanOrEqual(4);
        expect([
          "favorability",
          "infamy",
          "personalWealth",
          "politicalInfluence",
          "corpSentiment",
        ]).toContain(e.type);
      }
    }
  });

  it("keeps a healthy share of events open to every player", () => {
    const open = US_MODERN_PACK.filter((s) => !s.eligibility);
    expect(open.length).toBeGreaterThanOrEqual(10);
  });

  it("has no em or en dashes", () => {
    for (const s of US_MODERN_PACK) expect(JSON.stringify(s), s.kind).not.toMatch(DASHES);
  });
});
