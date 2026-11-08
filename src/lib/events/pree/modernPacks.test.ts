import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { EventDefinition } from "@/lib/db/types/events";
import { getEventHandler } from "@/lib/events/substrate/registry";
import { PREE_SEED_DEFINITIONS } from "./seedDefinitions";
import { MODERN_PACK_DEFINITIONS, MODERN_PACK_SPECS } from "./modernPacks";
import { filterEligibleTemplates } from "./weighting";
import { findDueBroadcast, broadcastMatchesCharacter } from "./broadcast";
import type { CharacterEventContext } from "./eligibility";
import "@/lib/events/pree/index";

function approved(): EventDefinition[] {
  return MODERN_PACK_DEFINITIONS.map((d) => ({
    ...d,
    status: "approved" as const,
    _id: new ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

function ctx(overrides: Partial<CharacterEventContext> = {}): CharacterEventContext {
  return {
    characterId: new ObjectId(),
    countryId: "US",
    isPolitician: true,
    isCeo: true,
    isInElection: true,
    ceoOwnershipFraction: 0.9,
    ...overrides,
  };
}

const DECADES = [
  ["2020s", 2020, 2029],
  ["2030s", 2030, 2039],
  ["2040s", 2040, 2049],
  ["2050s", 2050, 2059],
] as const;

const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);

describe("2027 world PREE packs", () => {
  it("are part of the seed catalogue with handlers that match", () => {
    const seeded = new Set(PREE_SEED_DEFINITIONS.map((d) => d.kind));
    for (const def of MODERN_PACK_DEFINITIONS) {
      expect(seeded.has(def.kind), def.kind).toBe(true);
      const handler = getEventHandler(def.kind);
      expect(handler, def.kind).toBeDefined();
      expect(handler!.options.map((o) => o.id).sort()).toEqual(def.options.map((o) => o.id).sort());
      expect(handler!.defaultOptionId).toBe(def.defaultOptionId);
    }
  });

  it.each(DECADES)(
    "has at least ten %s events that fire only inside that decade",
    (label, from, to) => {
      const pack = approved().filter((d) => d.kind.startsWith(`pree.decade.${label}.`));
      expect(pack.length).toBeGreaterThanOrEqual(10);
      for (const d of pack) {
        expect(d.minYear).toBe(from);
        expect(d.maxYear).toBe(to);
      }
      const kinds = new Set(pack.map((d) => d.kind));
      for (let year = 2020; year <= 2055; year++) {
        const eligible = filterEligibleTemplates(approved(), ctx(), null, 10, year).filter((e) =>
          kinds.has(e.definition.kind)
        );
        if (year >= from && year <= to)
          expect(eligible.length, `${label} in ${year}`).toBe(pack.length);
        else expect(eligible.length, `${label} in ${year}`).toBe(0);
      }
    }
  );

  it("gives every decade a role mix and sane weights and cooldowns", () => {
    for (const d of MODERN_PACK_DEFINITIONS.filter((x) => x.kind.startsWith("pree.decade."))) {
      expect(d.baseWeight, d.kind).toBeGreaterThan(0);
      expect(d.baseWeight, d.kind).toBeLessThanOrEqual(40);
      expect(d.cooldownTurnsMin, d.kind).toBeGreaterThanOrEqual(24);
      expect(d.cooldownTurnsMax, d.kind).toBeGreaterThanOrEqual(d.cooldownTurnsMin);
    }
    const tags = new Set(MODERN_PACK_DEFINITIONS.flatMap((d) => d.eligibility));
    expect(tags).toContain("politician");
    expect(tags).toContain("ceo");
  });

  it("has a one-shot broadcast for every decade", () => {
    const broadcasts = approved().filter((d) => d.broadcast);
    for (const [, from, to] of DECADES) {
      expect(
        broadcasts.some((b) => b.minYear! >= from && b.maxYear! <= to),
        `broadcast in ${from}s`
      ).toBe(true);
    }
    for (const b of broadcasts) {
      expect(b.broadcast).toBe("global");
      expect(b.minYear).toBeDefined();
      expect(b.maxYear).toBeDefined();
    }
  });

  it("fires each broadcast once, in its window only", () => {
    const broadcasts = approved().filter((d) => d.broadcast);
    for (const b of broadcasts) {
      expect(findDueBroadcast([b], null, b.minYear! - 1)).toBeNull();
      expect(findDueBroadcast([b], null, b.minYear)?.kind).toBe(b.kind);
      expect(findDueBroadcast([b], null, b.maxYear! + 1)).toBeNull();
      const ledger = { lastFiredTurnByKind: { [b.kind]: 5 } } as never;
      expect(findDueBroadcast([b], ledger, b.minYear)).toBeNull();
      expect(broadcastMatchesCharacter(b, ctx({ countryId: "BR" }))).toBe(true);
    }
  });

  it("scopes modern country packs to their own country from 2027", () => {
    const eligible = (countryId: "UK" | "DE" | "JP" | "CN", year: number) =>
      filterEligibleTemplates(approved(), ctx({ countryId }), null, 10, year)
        .map((e) => e.definition)
        .filter((d) => d.kind.startsWith(`pree.${countryId.toLowerCase()}.`));
    for (const country of ["UK", "DE", "JP", "CN"] as const) {
      const pack = MODERN_PACK_SPECS.filter((s) =>
        s.kind.startsWith(`pree.${country.toLowerCase()}.`)
      );
      expect(pack.length, country).toBeGreaterThanOrEqual(3);
      expect(eligible(country, 2026), country).toHaveLength(0);
      expect(eligible(country, 2030), country).toHaveLength(pack.length);
      expect(eligible(country, 2049), country).toHaveLength(pack.length);
    }
    const ukOnly = filterEligibleTemplates(approved(), ctx({ countryId: "US" }), null, 10, 2030);
    expect(ukOnly.some((e) => e.definition.kind.startsWith("pree.uk."))).toBe(false);
  });

  it("contains no em or en dashes in any player-facing text", () => {
    for (const d of MODERN_PACK_DEFINITIONS) {
      const text = JSON.stringify(d);
      expect(text, d.kind).not.toMatch(DASHES);
    }
    for (const spec of MODERN_PACK_SPECS) {
      expect(JSON.stringify(spec), spec.kind).not.toMatch(DASHES);
    }
  });
});
