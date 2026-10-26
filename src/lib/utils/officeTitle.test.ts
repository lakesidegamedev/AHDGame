import { describe, it, expect } from "vitest";
import { getOfficeLabel } from "./officeTitle";

describe("getOfficeLabel", () => {
  it("labels US president with realm phrase when countryId is US", () => {
    expect(getOfficeLabel({ type: "president" }, "US")).toBe("President of the United States");
  });

  it("labels UK prime minister with realm phrase when countryId is UK", () => {
    expect(getOfficeLabel({ type: "primeMinister" }, "UK")).toBe(
      "Prime Minister of the United Kingdom"
    );
  });

  it("labels UK prime minister using country config", () => {
    expect(getOfficeLabel({ type: "primeMinister" }, "UK")).toBe(
      "Prime Minister of the United Kingdom"
    );
  });

  it("labels German chancellor using country config", () => {
    expect(getOfficeLabel({ type: "chancellor" }, "DE")).toBe("Chancellor of Germany");
  });

  it("uses office type labels for Bundestag seats when countryId is DE", () => {
    expect(getOfficeLabel({ type: "bundestag", state: "BY", seatsHeld: 2 }, "DE")).toBe(
      "Member of Bundestag (BY, 2 seats)"
    );
  });

  it("falls back when countryId is omitted (US-centric defaults for national offices)", () => {
    expect(getOfficeLabel({ type: "president" })).toBe("President of the United States");
  });

  // Regression: CN (and other non-US) office types must render their configured
  // labels in party member rosters, not be dropped to an empty string or the raw
  // office key. See fix/office-list — offices weren't populating in the CCP roster.
  it("labels CN national executive offices with the realm phrase", () => {
    expect(getOfficeLabel({ type: "premier" }, "CN")).toBe("Premier of China");
    expect(getOfficeLabel({ type: "president" }, "CN")).toBe("President of China");
  });

  it("labels the CN central bank chair from config", () => {
    expect(getOfficeLabel({ type: "centralBankChair" }, "CN")).toBe("Governor of the PBoC");
  });

  it("labels CN legislative offices with config labels, not raw keys", () => {
    expect(getOfficeLabel({ type: "npcDelegate", state: "HZ" }, "CN")).toBe("NPC Delegate (HZ)");
    expect(getOfficeLabel({ type: "peoplesCongress", state: "HZ" }, "CN")).toBe(
      "Provincial Delegate (HZ)"
    );
  });
});
