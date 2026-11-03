/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SovereignBondRisk } from "./SovereignBondRisk";

describe("sovereign bond risk", () => {
  it("shows rating, crisis state and default even if an individual bond has not defaulted", () => {
    render(
      <SovereignBondRisk
        risk={{ creditRating: "CCC", crisisState: "recovering", lastDefaultTurn: 48 }}
      />
    );
    expect(screen.getByText(/Issuer credit: CCC/)).toBeTruthy();
    expect(screen.getByText(/Last sovereign default: turn 48/)).toBeTruthy();
    expect(screen.getByText(/reduce or delay payments/)).toBeTruthy();
    cleanup();
  });
  it("does not claim safety when issuer data is missing", () => {
    render(<SovereignBondRisk />);
    expect(screen.getByText(/Not rated/)).toBeTruthy();
    expect(screen.getByText(/unavailable/)).toBeTruthy();
    cleanup();
  });
});
