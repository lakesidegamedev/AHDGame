import { describe, expect, it } from "vitest";
import type { OpeningLawReference } from "../openingLaw";
import { openingLawTitle } from "./openingLawTitle";

const component = (sourceId: string, optionIndex: number, selectedOption: string) =>
  ({
    sourceId,
    optionIndex,
    selectedOption,
    historicalDisposition: "",
    fiscalOwner: "L16",
    fiscalRole: "",
    annualBooked: 0,
    treatment: "",
  }) as OpeningLawReference["sourceComponents"][number];

const reference = (components: OpeningLawReference["sourceComponents"]) =>
  ({
    key: "US:national:L16",
    country: "US",
    scope: "national",
    familyId: "L16",
    status: "modeled-game-seed",
    currentLaw: "2027-default modeled opening using A + B: No Program",
    legalNote: "",
    sourceComponents: components,
  }) as OpeningLawReference;

const lookup = (sourceId: string, index: number) =>
  sourceId === "us.health.universalCare.primary" && index === 1
    ? { lawName: "Public Health Coverage Act", levelName: "Safety-Net Clinics" }
    : null;

describe("opening law title", () => {
  it("names only the laws in force, with their enacted level", () => {
    expect(
      openingLawTitle(
        reference([
          component("us.health.universalCare.primary", 1, "Public Health Coverage Act"),
          component(
            "us.environment.urbanAir.primary",
            0,
            "Urban Air and Sanitation Act: No Program"
          ),
        ]),
        lookup
      )
    ).toBe("In force since the start: Public Health Coverage Act (Safety-Net Clinics)");
  });

  it("says so when no law was in force", () => {
    expect(openingLawTitle(reference([component("x", 0, "X Act: No Statute")]), lookup)).toBe(
      "No law in force since the start"
    );
  });

  it("replaces the internal no-mapped-seed wording with plain text", () => {
    const unmapped = {
      ...reference([]),
      status: "modeled-unmapped",
      currentLaw: "2027-default: no mapped seed law for L39",
    };
    expect(openingLawTitle(unmapped, lookup)).toBe("No dedicated law at the start of the game");
  });

  it("keeps hand-written titles for reviewed references", () => {
    const reviewed = { ...reference([]), status: "seeded-regimes", currentLaw: "Ethics Act" };
    expect(openingLawTitle(reviewed, lookup)).toBe("Ethics Act");
  });
});
