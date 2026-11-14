import { describe, expect, it } from "vitest";
import { COUNTRY_CLIENT_CONFIGS } from "./countryClientConfig";
import { COUNTRY_DISPLAY_CODES, countryDisplayCode } from "./countryDisplayCodes";

describe("country display codes", () => {
  it("match every country client config", () => {
    for (const [id, config] of Object.entries(COUNTRY_CLIENT_CONFIGS)) {
      expect(COUNTRY_DISPLAY_CODES[id], id).toBe(config.code);
    }
    expect(Object.keys(COUNTRY_DISPLAY_CODES).sort()).toEqual(
      Object.keys(COUNTRY_CLIENT_CONFIGS).sort()
    );
  });

  it("falls back to the id", () => {
    expect(countryDisplayCode("ZZ")).toBe("ZZ");
  });
});
