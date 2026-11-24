// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithElectionsMessages } from "@/lib/test-utils/renderWithElectionsMessages";
import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";
import { RaceNotes } from "./RaceNotes";

vi.mock("@/components/elections/JpStatutoryConstituencyList", () => ({
  JpStatutoryConstituencyList: () => <ol>statutory list</ol>,
}));

afterEach(cleanup);

const full = (over: Partial<ElectionResponse> = {}) =>
  ({ inPrimary: false, isEnded: false, ...over }) as unknown as ElectionResponse;

describe("RaceNotes", () => {
  it("says campaign season is open in a general's closing turns", () => {
    renderWithElectionsMessages(<RaceNotes election={full()} stage="general" turnsLeft={3} />);
    expect(screen.getByText(/Campaign season is open\. 3 turns left\./)).toBeTruthy();
  });

  it("says nothing before the closing turns or outside a general", () => {
    const { container } = renderWithElectionsMessages(
      <>
        <RaceNotes election={full()} stage="general" turnsLeft={12} />
        <RaceNotes election={full()} stage="primary" turnsLeft={2} />
      </>
    );
    expect(container.textContent).toBe("");
  });

  it("says where the sitting officeholder stands, even in another party's primary", () => {
    renderWithElectionsMessages(
      <>
        <RaceNotes
          election={full({
            incumbent: {
              name: "Chris Hansen",
              party: "Democratic",
              partyColor: null,
              running: true,
            },
          })}
          stage="primary"
          turnsLeft={20}
        />
        <RaceNotes
          election={full({
            incumbent: {
              name: "Ann Lee",
              party: "Republican",
              partyColor: null,
              running: false,
              notRunningReason: "Term limited",
            },
          })}
          stage="general"
          turnsLeft={20}
        />
      </>
    );
    const notes = screen.getAllByTestId("cm-incumbent-note").map((n) => n.textContent);
    expect(notes[0]).toBe(
      "Sitting officeholder Chris Hansen (Democratic) is running for re-election in their party's race."
    );
    expect(notes[1]).toBe(
      "Sitting officeholder Ann Lee (Republican) is not on the ballot: Term limited."
    );
  });

  it("names a Hungarian by-election's district", () => {
    renderWithElectionsMessages(
      <RaceNotes
        election={full({ hungarianModernByElection: { districtId: "BP-03" } })}
        stage="primary"
        turnsLeft={10}
      />
    );
    expect(screen.getByText(/Constituency by-election: BP-03/)).toBeTruthy();
  });

  it("explains Japan's 1994 mixed chamber with its statutory map", () => {
    renderWithElectionsMessages(
      <RaceNotes
        election={full({
          state: "JP-13",
          japanShugiinRules: { ruleVersion: "mixed-1994-v1", districtSeats: 300, listSeats: 200 },
        })}
        stage="primary"
        turnsLeft={10}
      />
    );
    expect(
      screen.getByText(/300 district constituencies and 200 regional party-list seats/)
    ).toBeTruthy();
    expect(screen.getByText("1994 statutory constituency map")).toBeTruthy();
  });
});
