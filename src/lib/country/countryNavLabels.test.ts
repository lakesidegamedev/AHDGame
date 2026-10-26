import { describe, expect, it } from "vitest";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";
import { COUNTRY_NAV_LABELS } from "./countryNavLabels";

describe("COUNTRY_NAV_LABELS", () => {
  it("matches the generated client config for every country", () => {
    for (const [id, config] of Object.entries(COUNTRY_CLIENT_CONFIGS)) {
      const labels = COUNTRY_NAV_LABELS[id as keyof typeof COUNTRY_NAV_LABELS];
      expect(labels.governmentType).toBe(config.governmentType);
      expect(labels.executiveLabel).toBe(config.executiveLabel);
      expect(labels.executivePath).toBe(config.executivePath);
      expect(labels.legislatureName).toBe(config.legislature.name);
      expect(labels.legislaturePath).toBe(config.legislature.path);
    }
  });
});
