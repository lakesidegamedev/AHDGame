import { describe, expect, it } from "vitest";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";
import { COUNTRY_REGION_LABELS } from "./countryRegionLabels";

describe("COUNTRY_REGION_LABELS", () => {
  it("matches the generated client config for every country", () => {
    for (const [id, config] of Object.entries(COUNTRY_CLIENT_CONFIGS)) {
      const labels = COUNTRY_REGION_LABELS[id as keyof typeof COUNTRY_REGION_LABELS];
      expect(labels.singular).toBe(config.regionLabel);
      expect(labels.plural).toBe(config.regionLabelPlural);
    }
  });
});
