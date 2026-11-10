import { describe, expect, it } from "vitest";
import { SEED_PRESET_IDS } from "@/lib/constants/turnTime";
import { checkSeedContract } from "@/lib/seeds/contract/checkSeedContract";
import { SINGLEPLAYER_FEATURE_FLAGS } from "@/lib/singleplayerFeatureFlags";
import { buildSingleplayerCapabilities } from "./capabilities";
import pkg from "../../../package.json";

describe("buildSingleplayerCapabilities", () => {
  const manifest = buildSingleplayerCapabilities();

  it("lists every shipping preset and marks exactly the ready ones seedable", () => {
    expect(manifest.presets.map((entry) => entry.preset)).toEqual([...SEED_PRESET_IDS]);
    const seedable = manifest.presets.filter((entry) => entry.seedable).map((e) => e.preset);
    const ready = SEED_PRESET_IDS.filter((preset) => checkSeedContract(preset).length === 0);
    expect(seedable).toEqual(ready);
    expect(seedable).toContain("2027-default");
  });

  it("gives 2027 the US as its only player country and keeps unready eras empty", () => {
    const era2027 = manifest.presets.find((entry) => entry.preset === "2027-default");
    expect(era2027?.playerCountries).toEqual([{ id: "US", name: "United States" }]);
    expect(era2027?.computerCountries.map((entry) => entry.id)).toContain("UK");
    expect(era2027?.backgroundCountries.map((entry) => entry.id)).toContain("IE");
    for (const entry of manifest.presets.filter((preset) => !preset.seedable)) {
      expect(entry.playerCountries).toEqual([]);
      expect(entry.computerCountries).toEqual([]);
      expect(entry.backgroundCountries).toEqual([]);
    }
  });

  it("reports the shape the client builds against", () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.gameVersion).toBe(pkg.version);
    expect(manifest.defaultPreset).toBe("2027-default");
    expect(manifest.modes).toEqual(["normal", "head-of-state", "worldsim"]);
    expect(manifest.difficulties).toEqual(["easy", "normal", "hard"]);
    expect(manifest.autonomyLevels).toEqual(["off", "v0", "v1", "v2", "v3", "v4", "v5", "v6"]);
    expect(manifest.defaultAutonomyLevel).toBe("v6");
    expect(manifest.featureFlags.map((flag) => flag.key)).toEqual(
      SINGLEPLAYER_FEATURE_FLAGS.map((flag) => flag.key)
    );
  });

  it("describes every flag in its own words", () => {
    for (const flag of manifest.featureFlags) {
      expect(flag.description).not.toMatch(/in this local world/);
      expect(flag.description).not.toMatch(/[–—]/);
    }
  });
});
