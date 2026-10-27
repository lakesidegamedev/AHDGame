import { describe, expect, it } from "vitest";
import { COUNTRY_DISPLAY_LABELS } from "./countryDisplayLabels";
import { COUNTRY_CLIENT_CONFIGS } from "./countryClientConfig";

describe("countryDisplayLabels", () => {
  it("covers exactly the countries the client registry covers", () => {
    expect(Object.keys(COUNTRY_DISPLAY_LABELS).sort()).toEqual(
      Object.keys(COUNTRY_CLIENT_CONFIGS).sort()
    );
  });

  it("matches the registry country by country", () => {
    for (const [countryId, label] of Object.entries(COUNTRY_DISPLAY_LABELS)) {
      const config = COUNTRY_CLIENT_CONFIGS[countryId as keyof typeof COUNTRY_CLIENT_CONFIGS];
      expect(label.name, countryId).toBe(config.name);
      expect(label.exchangeName, countryId).toBe(config.exchangeName);
      expect(label.exchangeKind, countryId).toBe(config.exchangeKind);
      expect(label.flagEmoji, countryId).toBe(config.flagEmoji);
      expect(label.executiveLabel, countryId).toBe(config.executiveLabel);
      expect(label.regionLabel, countryId).toBe(config.regionLabel);
      expect(label.regionLabelPlural, countryId).toBe(config.regionLabelPlural);
    }
  });
});
