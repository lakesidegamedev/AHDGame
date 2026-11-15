import { describe, expect, it } from "vitest";
import { ERA_CONFIGS, getEraConfig } from "./eraThemes";

describe("2027 era config", () => {
  const config = ERA_CONFIGS["2027"];

  it("no longer reuses the 2023 copy", () => {
    const old = ERA_CONFIGS["2023"];
    expect(config.id).toBe("2027");
    expect(config.heroDek).not.toBe(old.heroDek);
    expect(config.eraChips).not.toEqual(old.eraChips);
    expect(config.playSectionDek).not.toBe(old.playSectionDek);
    expect(config.worldSectionDek).not.toBe(old.worldSectionDek);
    for (const text of [config.heroDek, ...config.eraChips]) {
      expect(text).not.toMatch(/Ukraine|inflation/i);
    }
    expect(getEraConfig(2027)).toBe(config);
  });

  it("opens the United States and Canada to players and no one else", () => {
    const playable = Object.entries(config.accessMap)
      .filter(([, access]) => access.enabledForPlayers)
      .map(([id]) => id)
      .sort();
    expect(playable).toEqual(["CA", "US"]);
  });

  it("lists two player nations, four computer-run simulations and sixteen background", () => {
    const byTier = (tier: string) =>
      config.nations
        .filter((nation) => nation.tier === tier)
        .map((nation) => nation.id)
        .sort();
    expect(byTier("player")).toEqual(["CA", "US"]);
    expect(byTier("npp")).toEqual(["CN", "DE", "JP", "UK"]);
    expect(byTier("background")).toHaveLength(16);
    expect(config.nations).toHaveLength(22);
    expect(new Set(config.nations.map((nation) => nation.id)).size).toBe(22);
  });

  it("keeps background countries out of the access map, so the globe does not name them", () => {
    for (const nation of config.nations.filter((n) => n.tier === "background")) {
      expect(config.accessMap[nation.id], nation.id).toBeUndefined();
    }
  });

  it("templates the playable count in the world copy", () => {
    expect(config.worldSectionDek).toContain("{playableCount}");
  });

  it("does not use the 2019 roster", () => {
    const ids = config.nations.map((nation) => nation.id);
    expect(ids).toContain("CA");
    expect(ids).not.toContain("IN");
  });

  it("groups its country list by tier, not by Cold War bloc", () => {
    expect(config.rosterGrouping).toBe("tier");
    expect(ERA_CONFIGS["1991"].rosterGrouping).toBeUndefined();
  });

  it("names Canada's institutions in the feature tiles", () => {
    expect(config.tileBodies?.ballot).toContain("House of Commons");
    expect(config.tileBodies?.markets).toContain("Canadian dollar");
  });
});
