import { describe, expect, it } from "vitest";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";
import {
  INTORG_REPRESENTATIVE_CENTRAL_BANK,
  getRepresentativeCentralBankCountry,
} from "./intorgRepresentative";

describe("intorgRepresentative", () => {
  it("names the first configured country for every shared central bank org", () => {
    const configured = Object.values(COUNTRY_CLIENT_CONFIGS).filter(
      (config) => config.centralBank.centralBankIntorgId
    );
    for (const config of configured) {
      const intorgId = config.centralBank.centralBankIntorgId!;
      expect(INTORG_REPRESENTATIVE_CENTRAL_BANK[intorgId]).toBe(config.id);
    }
  });

  it("returns null for an organisation without a shared bank", () => {
    expect(getRepresentativeCentralBankCountry("NATO")).toBeNull();
  });
});
