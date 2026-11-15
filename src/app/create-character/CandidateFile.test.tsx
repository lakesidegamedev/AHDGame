/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CandidateFile } from "./CandidateFile";
import type { PickedImage } from "./useImagePick";
import type { CompassPoint } from "@/lib/registration/alignment";

const noopImage: PickedImage = {
  file: null,
  previewUrl: null,
  error: null,
  pick: () => {},
  clear: () => {},
};

const REPORTED_MISMATCH: CompassPoint = { economic: 0.3, social: 1.2 };

const MAIN_PARTIES = [
  { id: "lab", name: "Labour Party", economicPosition: -2, socialPosition: -1, memberCount: 20 },
  {
    id: "con",
    name: "Conservative Party",
    economicPosition: 2,
    socialPosition: 2,
    memberCount: 30,
  },
];

function renderCandidateFile(
  regionName: string,
  electorate: CompassPoint,
  parties?: typeof MAIN_PARTIES
) {
  return render(
    <CandidateFile
      name="Test Candidate"
      countryName="United Kingdom"
      countryFlagUrl={null}
      regionName={regionName}
      electorate={electorate}
      partyName={null}
      partyAbbreviation={null}
      partyColor={null}
      partyId={null}
      partyCountryId={null}
      partyPoint={null}
      position={{ economic: 0, social: 0 }}
      demographics={{ race: "", gender: "", education: "", wealth: "" }}
      startingCapital={null}
      requirements={[]}
      isSubmitting={false}
      portrait={noopImage}
      header={noopImage}
      parties={parties}
    />
  );
}

describe("CandidateFile electorate lean display", () => {
  it("does not present the combined lean as the economic compass coordinate", () => {
    renderCandidateFile("Reported region", REPORTED_MISMATCH);
    expect(
      screen.getByText("Electoral lean: Center-Right. Economic: Centrist. Social: Center-Trad.")
    ).toBeTruthy();
  });

  it("labels the electoral lean by the main party it favours", () => {
    renderCandidateFile("Reported region", { economic: 1.5, social: 1.5 }, MAIN_PARTIES);
    expect(
      screen.getByText(
        "Electoral lean: Solid Conservative. Economic: Lean Right. Social: Lean Trad."
      )
    ).toBeTruthy();
  });
});
