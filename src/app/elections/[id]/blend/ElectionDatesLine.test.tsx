// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PRIMARY_ESTIMATE_NOTE } from "@/lib/elections/rules/primaryEstimateNote";
import { ElectionDatesLine } from "./ElectionDatesLine";

const election = (over: Record<string, unknown>) =>
  ({
    isEnded: false,
    isUpcoming: false,
    inPrimary: true,
    primaryEndTurn: 56,
    endTurn: 80,
    gameState: { currentTurn: 0 },
    ...over,
  }) as never;

describe("ElectionDatesLine", () => {
  it("shows when filing closes, which is when the primary ends", () => {
    render(<ElectionDatesLine election={election({})} />);
    expect(screen.getByText("Filing closes")).toBeTruthy();
    expect(screen.getAllByText("56 turns")).toHaveLength(2);
  });

  it("drops the filing row once the primary is over", () => {
    render(<ElectionDatesLine election={election({ inPrimary: false })} />);
    expect(screen.queryByText("Filing closes")).toBeNull();
  });
});

describe("PRIMARY_ESTIMATE_NOTE", () => {
  it("is plain copy with no dashes", () => {
    expect(PRIMARY_ESTIMATE_NOTE).not.toMatch(/[–—]/);
  });
});
