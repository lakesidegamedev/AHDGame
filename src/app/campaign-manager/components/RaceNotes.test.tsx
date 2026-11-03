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
