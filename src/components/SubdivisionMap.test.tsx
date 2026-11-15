/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SubdivisionMap } from "./SubdivisionMap";

afterEach(cleanup);
describe("district result tooltip", () => {
  it("shows the party label and explains unavailable data without claiming an even lean or tied margin", () => {
    const { container } = render(
      <SubdivisionMap
        viewBox="0 0 10 10"
        subdivisions={[
          {
            id: "MT-01",
            name: "MT-01",
            path: "M0,0L10,0L10,10Z",
            winner: "candidate",
            party: "1",
            partyLabel: "DEM",
            margin: 0,
            marginAvailable: false,
            leanScalar: 0,
            leanStatus: "unavailable",
          },
        ]}
        candidateNames={{ candidate: "Recorded winner" }}
        candidateParties={{ candidate: "1" }}
      />
    );
    const path = container.querySelector("path")!;
    fireEvent.mouseEnter(path);
    fireEvent.mouseMove(path, { clientX: 5, clientY: 5 });
    expect(screen.getByText("DEM")).toBeTruthy();
    expect(screen.getByText(/Unavailable \(no district PVI source\)/)).toBeTruthy();
    expect(screen.getByText("District vote margin unavailable")).toBeTruthy();
    expect(screen.queryByText(/Lean: Even/)).toBeNull();
    expect(screen.queryByText("Margin: 0.0%")).toBeNull();
  });
});
