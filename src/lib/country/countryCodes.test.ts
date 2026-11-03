import { describe, expect, it } from "vitest";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";
import { getCountryCode } from "./countryCodes";

describe("getCountryCode", () => {
  it("matches the generated client config for every country", () => {
    for (const [id, config] of Object.entries(COUNTRY_CLIENT_CONFIGS)) {
      expect(getCountryCode(id as never)).toBe(config.code);
    }
  });

  it("returns the input for an unknown id", () => {
    expect(getCountryCode("" as never)).toBe("");
    expect(getCountryCode("STALE" as never)).toBe("STALE");
  });
});
