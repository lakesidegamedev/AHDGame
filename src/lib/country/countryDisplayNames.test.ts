import { describe, expect, it } from "vitest";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";
import { getCountryDisplayName } from "./countryDisplayNames";

describe("getCountryDisplayName", () => {
  it("matches the generated client config for every country", () => {
    for (const [id, config] of Object.entries(COUNTRY_CLIENT_CONFIGS)) {
      expect(getCountryDisplayName(id as never)).toBe(config.name);
    }
  });

  it("applies the era aliases the client config applies", () => {
    expect(getCountryDisplayName("DE", "1953-default")).toBe("West Germany");
    expect(getCountryDisplayName("RU", "1991-default")).toBe("Soviet Union");
    expect(getCountryDisplayName("RU", "2027-default")).toBe("Russia");
  });

  it("returns the input for an unknown id", () => {
    expect(getCountryDisplayName("" as never)).toBe("");
    expect(getCountryDisplayName("STALE" as never)).toBe("STALE");
  });
});
