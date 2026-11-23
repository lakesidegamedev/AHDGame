/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let live: { currentTurn: number } | null = { currentTurn: 163 };
vi.mock("@/hooks/useGameEvents", () => ({ useGameTurnStatus: () => live }));

import { StaleTurnNotice, staleFiguresTurn } from "./StaleTurnNotice";

describe("staleFiguresTurn", () => {
  it("reports only data older than the live turn", () => {
    expect(staleFiguresTurn(162, 163)).toBe(162);
    expect(staleFiguresTurn(163, 163)).toBeNull();
    expect(staleFiguresTurn(164, 163)).toBeNull();
    expect(staleFiguresTurn(0, 163)).toBeNull();
    expect(staleFiguresTurn(162, null)).toBeNull();
  });
});

describe("StaleTurnNotice", () => {
  it("labels previous-turn figures and hides once current", () => {
    live = { currentTurn: 163 };
    const { rerender } = render(<StaleTurnNotice dataTurn={162} />);
    expect(screen.getByText("Figures from turn 162, updating.")).toBeTruthy();
    rerender(<StaleTurnNotice dataTurn={163} />);
    expect(screen.queryByText(/updating/)).toBeNull();
  });
});
