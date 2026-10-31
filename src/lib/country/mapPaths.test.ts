import { describe, expect, it } from "vitest";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";
import { getCountryMapPath } from "./mapPaths";

describe("getCountryMapPath", () => {
  it("matches the generated client config for every country", () => {
    for (const [id, config] of Object.entries(COUNTRY_CLIENT_CONFIGS)) {
      expect(getCountryMapPath(id as never)).toBe(config.mapPath);
    }
  });
});
