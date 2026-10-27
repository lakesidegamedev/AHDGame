import { describe, expect, it } from "vitest";
import { COUNTRY_RUNTIME_SEED } from "./countryRuntimeSeed";
import { COUNTRY_CLIENT_CONFIGS } from "./countryClientConfig";

describe("countryRuntimeSeed", () => {
  it("covers exactly the countries the client registry covers", () => {
    expect(Object.keys(COUNTRY_RUNTIME_SEED).sort()).toEqual(
      Object.keys(COUNTRY_CLIENT_CONFIGS).sort()
    );
  });

  it("matches the registry runtime fields country by country", () => {
    for (const [countryId, seed] of Object.entries(COUNTRY_RUNTIME_SEED)) {
      const config = COUNTRY_CLIENT_CONFIGS[countryId as keyof typeof COUNTRY_CLIENT_CONFIGS];
      expect(seed.governmentType, countryId).toBe(config.governmentType);
      expect(seed.rulingPartyId, countryId).toBe(config.rulingPartyId ?? null);
      expect(seed.hasLeaderConfidenceModel, countryId).toBe(
        config.hasLeaderConfidenceModel ?? false
      );
    }
  });
});
