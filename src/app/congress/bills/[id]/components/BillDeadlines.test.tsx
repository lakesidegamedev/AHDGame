/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatRemainingTurns } from "@/lib/time/formatRemainingTurns";
import { DeadlineCountdown } from "./DeadlineCountdown";
import { VoteBar } from "./VoteBar";

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
const voteBarProps = {
  votesFor: 1,
  votesAgainst: 0,
  votesAbstain: 0,
  label: "Senate Vote",
  myVote: null,
  canVote: false,
};

describe("DeadlineCountdown", () => {
  it("shows turns remaining, not Expired, when the date passed but the closing turn has not", () => {
    render(<DeadlineCountdown deadline={past} deadlineTurn={103} />);
    expect(screen.getByText(/3 turns/)).toBeTruthy();
    expect(screen.queryByText(/Expired/)).toBeNull();
  });
  it("shows Awaiting result once the closing turn arrives", () => {
    currentTurn = 103;
    render(<DeadlineCountdown deadline={past} deadlineTurn={103} />);
    expect(screen.getByText(/Awaiting result/)).toBeTruthy();
    expect(screen.queryByText(/Expired/)).toBeNull();
  });
  it("keeps the wall-clock Expired label for legacy bills with no closing turn", () => {
    render(<DeadlineCountdown deadline={past} />);
    expect(screen.getByText(/Expired/)).toBeTruthy();
  });
});

describe("VoteBar deadline", () => {
  it("does not read Expired on an open second chamber vote past its date", () => {
    render(<VoteBar {...voteBarProps} deadline={past} deadlineTurn={105} />);
    expect(screen.getByText(/5 turns/)).toBeTruthy();
    expect(screen.queryByText(/Expired/)).toBeNull();
  });
  it("shows Awaiting result at the closing turn", () => {
    currentTurn = 105;
    render(<VoteBar {...voteBarProps} deadline={past} deadlineTurn={105} />);
    expect(screen.getByText(/Awaiting result/)).toBeTruthy();
  });
  it("falls back to the date for legacy bills", () => {
    render(<VoteBar {...voteBarProps} deadline={past} />);
    expect(screen.getByText(/Expired/)).toBeTruthy();
  });
});
