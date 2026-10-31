import { describe, expect, it } from "vitest";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";
import { parseCountryParam } from "./parseCountryParam";

describe("parseCountryParam", () => {
  it("accepts every configured country, including latent ones", () => {
    for (const id of Object.keys(COUNTRY_CLIENT_CONFIGS)) {
      expect(parseCountryParam(id.toLowerCase())).toBe(id);
    }
  });

  it("matches case-insensitively and rejects unknown ids", () => {
    expect(parseCountryParam("us")).toBe("US");
    expect(parseCountryParam("Us")).toBe("US");
    expect(parseCountryParam("sco")).toBe("SCO");
    expect(parseCountryParam("XX")).toBeNull();
    expect(parseCountryParam("")).toBeNull();
    expect(parseCountryParam(null)).toBeNull();
  });
});
