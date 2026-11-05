/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { fieldOfficeCountyRows } from "./fieldOfficeMath";
import { FieldOfficeKey, FieldOfficeOverlay, FieldOfficeTip } from "./FieldOfficeMapParts";

const rows = fieldOfficeCountyRows(
  [
    {
      id: "A",
      name: "Alpha",
      path: "M0,0L10,0L10,10L0,10Z",
      electorateShare: 0.3,
      basePvi: 1,
      livePvi: 2,
      marginalPct: 0.5,
      officeId: "o1",
    },
    {
      id: "B",
      name: "Beta",
      path: "M20,0L30,0L30,10Z",
      electorateShare: 0.2,
      basePvi: 1,
      livePvi: 2,
      officeId: null,
    },
  ],
  "fieldLean"
);

describe("FieldOfficeOverlay", () => {
  it("pins only the counties that hold an office", () => {
    render(
      <svg>
        <FieldOfficeOverlay rows={rows} viewBox="0 0 100 100" selected={null} />
      </svg>
    );
    expect(screen.getAllByTestId("field-office-pin")).toHaveLength(1);
  });

  it("outlines the picked county", () => {
    const { container } = render(
      <svg>
        <FieldOfficeOverlay rows={rows} viewBox="0 0 100 100" selected="B" />
      </svg>
    );
    expect(container.querySelectorAll("path")).toHaveLength(1);
    expect(container.querySelector("path")?.getAttribute("d")).toBe("M20,0L30,0L30,10Z");
  });
});

describe("FieldOfficeTip", () => {
  it("shows lean, the office and what a new office adds", () => {
    render(<FieldOfficeTip county={rows[1]} stateId="OH" x={10} y={10} frameWidth={800} />);
    expect(screen.getByRole("tooltip").textContent).toMatch(/Beta/);
    expect(screen.getByRole("tooltip").textContent).toMatch(/Right \+2.0/);
  });

  it("does not quote a new office's value for a county that already has one", () => {
    render(<FieldOfficeTip county={rows[0]} stateId="OH" x={10} y={10} frameWidth={800} />);
    expect(screen.getByRole("tooltip").textContent).toMatch(/office open/);
    expect(screen.getByRole("tooltip").textContent).not.toMatch(/New office/);
  });
});

describe("FieldOfficeKey", () => {
  it("labels the two views", () => {
    const { rerender } = render(<FieldOfficeKey view="fieldLean" note="County lean from X" />);
    expect(screen.getByText("COUNTY LEAN:")).toBeTruthy();
    expect(screen.getByText("County lean from X")).toBeTruthy();
    rerender(<FieldOfficeKey view="fieldValue" note="County lean from X" />);
    expect(screen.getByText("VALUE OF A NEW OFFICE:")).toBeTruthy();
    expect(screen.queryByText("County lean from X")).toBeNull();
  });
});
