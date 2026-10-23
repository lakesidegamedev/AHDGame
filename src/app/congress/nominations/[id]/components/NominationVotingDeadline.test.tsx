/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatRemainingTurns } from "@/lib/time/formatRemainingTurns";
import { NominationVotingDeadline } from "./NominationVotingDeadline";

let currentTurn = 100;
vi.mock("@/contexts/useGameClock", () => ({
  useGameClock: () => ({
    currentTurn,
    formatRemainingTurns: (target: number) => formatRemainingTurns(target, currentTurn),
  }),
}));
afterEach(() => {
  cleanup();
  currentTurn = 100;
});
const past = "2001-01-01T00:00:00Z";
describe("nomination voting countdown", () => {
  it("keeps a future turn deadline open even after its clock date", () => {
    render(<NominationVotingDeadline votingEndsAt={past} votingEndsOnTurn={103} />);
    expect(screen.getByText(/3 turns/)).toBeTruthy();
    expect(screen.queryByText(/Expired/)).toBeNull();
  });
  it("updates when a completed turn advances the shared clock", () => {
    const view = render(<NominationVotingDeadline votingEndsAt={past} votingEndsOnTurn={103} />);
    currentTurn = 101;
    view.rerender(<NominationVotingDeadline votingEndsAt={past} votingEndsOnTurn={103} />);
    expect(screen.getByText(/2 turns/)).toBeTruthy();
  });
  it("shows a pending result when the closing turn arrives", () => {
    currentTurn = 103;
    render(<NominationVotingDeadline votingEndsAt={past} votingEndsOnTurn={103} />);
    expect(screen.getByText(/Awaiting result/)).toBeTruthy();
    expect(screen.queryByText(/Expired/)).toBeNull();
  });
  it("retains the date fallback for legacy nominations", () => {
    render(<NominationVotingDeadline votingEndsAt={past} />);
    expect(screen.getByText(/Expired/)).toBeTruthy();
  });
});
