// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LegislatureCompositionSection } from "./LegislatureCompositionSection";
import type { LegislatureMember } from "./types";

vi.mock("./useCoalitionView", () => ({
  useCoalitionView: () => ({
    loaded: false,
    hasCoalitionSeats: () => false,
    buildCoalitionView: () => null,
  }),
}));

function bloc(id: string, name: string, seatsHeld: number): LegislatureMember {
  return {
    id,
    characterId: null,
    sequentialId: 1,
    characterName: name,
    region: "Ohio",
    party: "1",
    partyName: "Democratic",
    partyColor: "#00f",
    countryId: "US",
    seatsHeld,
    isNPP: true,
    isVacant: false,
  };
}

describe("LegislatureCompositionSection bloc list", () => {
  it("says rows are party blocs and totals their seats", () => {
    const { container } = render(
      <LegislatureCompositionSection
        data={{
          members: [bloc("a", "Andre Wright", 19), bloc("b", "Charles Friedman", 14)],
          composition: [],
          totalSeats: 33,
          filledSeats: 33,
        }}
        chamberLabel="State Senate"
        showSeatsColumn
        countryId="US"
      />
    );
    const text = container.textContent ?? "";
    expect(text).toContain("2 party blocs holding 33 seats");
    expect(text).toContain("not individual legislators");
  });

  it("titles the chart card distinctly from the chamber name", () => {
    render(
      <LegislatureCompositionSection
        data={{
          members: [bloc("a", "Andre Wright", 19)],
          composition: [],
          totalSeats: 19,
          filledSeats: 19,
        }}
        chamberLabel="Senate"
        showSeatsColumn={false}
        countryId="US"
      />
    );
    expect(screen.getByRole("heading", { level: 2, name: "Senate composition" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2, name: "Senate" })).toBeNull();
  });
});
