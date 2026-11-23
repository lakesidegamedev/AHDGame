// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ElectionDisplay } from "@/lib/db/types";
import { FieldCell, RegionCell } from "./ElectionRowCells";

const race = (over: Partial<ElectionDisplay>) =>
  ({
    id: "e1",
    electionType: "commons",
    state: "EAE",
    countryId: "UK",
    totalSeats: 47,
    candidates: [],
    ...over,
  }) as unknown as ElectionDisplay;

describe("RegionCell", () => {
  it("tags a by-election so it reads apart from the region's regular race", () => {
    // Ticket 1379: both rows sit in the House of Commons section under the same
    // region, and only the seat count told them apart.
    render(<RegionCell election={race({ electionType: "special_commons", totalSeats: 12 })} />);
    expect(screen.getByText("By-election")).toBeTruthy();
    expect(screen.getByText("12 seats")).toBeTruthy();
  });

  it("leaves the regular race untagged", () => {
    render(<RegionCell election={race({})} />);
    expect(screen.queryByText("By-election")).toBeNull();
    expect(screen.getByText("47 seats")).toBeTruthy();
  });
});

describe("FieldCell", () => {
  const leader = (
    partyId: string,
    partyName: string,
    name: string,
    sharePct: number,
    fieldSize: number
  ) => ({
    partyId,
    partyName,
    partyColor: "#123456",
    candidateId: `${partyId}-1`,
    name,
    sharePct,
    fieldSize,
  });

  it("labels each primary's front-runner by party instead of crowning one", () => {
    render(
      <FieldCell
        election={race({
          candidates: [{}, {}, {}] as never,
          polling: {
            leaderId: null,
            leaderName: null,
            leaderParty: null,
            sharesPct: {},
            candidateNames: {},
            candidateParties: {},
            source: "primary",
            primaryLeaders: [
              leader("1", "Liberal", "Rachel Paquette", 100, 1),
              leader("2", "Conservative", "Benjamin Nasser", 60, 2),
            ],
          },
        })}
      />
    );
    expect(screen.getByText("Rachel Paquette")).toBeTruthy();
    expect(screen.getByText("Benjamin Nasser")).toBeTruthy();
    expect(screen.getByText(/Uncontested in Liberal primary/)).toBeTruthy();
    expect(screen.getByText(/60% in Conservative primary/)).toBeTruthy();
  });

  it("marks a lone candidate uncontested", () => {
    render(<FieldCell election={race({ candidates: [{}] as never })} />);
    expect(screen.getByText("1 candidate, uncontested")).toBeTruthy();
  });
});
