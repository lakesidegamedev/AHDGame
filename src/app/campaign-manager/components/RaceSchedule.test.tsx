// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithElectionsMessages } from "@/lib/test-utils/renderWithElectionsMessages";
import { endTimeToGameYear } from "@/lib/utils/formattersCore";
import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";
import { RaceSchedule } from "./RaceSchedule";

vi.mock("@/contexts/useGameClock", () => ({
  useGameClock: () => ({
    formatRemainingTurns: (turn: number) =>
      turn <= 10
        ? { text: "Ended", urgency: "ended" }
        : { text: `${turn - 10} turns`, urgency: "normal" },
    formatRemaining: () => ({ text: "No timer", urgency: "normal" }),
    currentTurn: 10,
    lastTurnProcessed: new Date("2026-01-01T00:00:00Z"),
    formatYear: (ts: Date | string | null) =>
      ts ? endTimeToGameYear(ts, 10, new Date("2026-01-01T00:00:00Z"), 1994) : null,
  }),
}));

afterEach(cleanup);

const race = (over: Partial<ElectionResponse> = {}) =>
  ({
    inPrimary: true,
    isEnded: false,
    isUpcoming: false,
    startTurn: 2,
    primaryEndTurn: 16,
    endTurn: 40,
    startTime: "1993-01-01T00:00:00Z",
    primaryEndTime: "1994-03-01T00:00:00Z",
    endTime: "1994-11-01T00:00:00Z",
    ...over,
  }) as unknown as ElectionResponse;

describe("RaceSchedule", () => {
  it("shows each stage's end in turns and in-game date", () => {
    renderWithElectionsMessages(<RaceSchedule election={race()} />);
    expect(screen.getByText("Primary ends")).toBeTruthy();
    expect(screen.getByText("6 turns · 1994")).toBeTruthy();
    expect(screen.getByText("Voting closes")).toBeTruthy();
    expect(screen.getByText("30 turns · 1994")).toBeTruthy();
  });

  it("expands to the full schedule", () => {
    renderWithElectionsMessages(<RaceSchedule election={race()} />);
    expect(screen.queryByText("Primary opened")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show full schedule" }));
    expect(screen.getByText("Primary opened")).toBeTruthy();
    expect(screen.getByText("Ended · 1994")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide full schedule" })).toBeTruthy();
  });

  it("shows the result date on a finished race", () => {
    renderWithElectionsMessages(
      <RaceSchedule election={race({ inPrimary: false, isEnded: true, endTurn: 9 })} />
    );
    expect(screen.getByText("Result declared")).toBeTruthy();
    expect(screen.getByText("1994")).toBeTruthy();
    expect(screen.queryByText("Primary ends")).toBeNull();
  });

  it("draws nothing for a race with no schedule", () => {
    const { container } = renderWithElectionsMessages(
      <RaceSchedule election={race({ endTime: null, primaryEndTime: null })} />
    );
    expect(container.textContent).toBe("");
  });
});

it("keeps turn-based years stable when saved timestamps drift during a pause", () => {
  renderWithElectionsMessages(
    <RaceSchedule
      election={race({
        primaryEndTurn: 120,
        endTurn: 144,
        primaryEndTime: "2050-01-01",
        endTime: "2050-01-02",
      })}
    />
  );
  expect(screen.getByText("134 turns · 1996")).toBeTruthy();
  expect(screen.queryByText(/2050/)).toBeNull();
});

it("keeps the timestamp fallback on legacy races without turn deadlines", () => {
  renderWithElectionsMessages(
    <RaceSchedule
      election={race({ primaryEndTurn: null, endTurn: null, endTime: "2026-01-01T00:00:00Z" })}
    />
  );
  expect(screen.getAllByText("No timer · 1994")).toHaveLength(2);
});
