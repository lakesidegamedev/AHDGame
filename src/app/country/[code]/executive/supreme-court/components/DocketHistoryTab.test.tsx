// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DocketHistoryTab } from "./DocketHistoryTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("explains the empty 2027 docket without promising a scheduled case", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ cases: [], upcomingCases: [], proceduralOnly: true }))
  );

  render(<DocketHistoryTab countryCode="us" />);

  expect(await screen.findByText(/New cases can arise during play/)).toBeTruthy();
  expect(screen.getByText("No rulings have been recorded.")).toBeTruthy();
});

it("shows the actual hearing turn when a case is filed", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        cases: [],
        proceduralOnly: true,
        upcomingCases: [
          {
            caseKey: "sample-case",
            title: "Example v. United States",
            axis: "economic",
            decisionYear: 2028,
            hearingDueTurn: 121,
          },
        ],
      })
    )
  );

  render(<DocketHistoryTab countryCode="us" />);

  expect(await screen.findByText("Example v. United States")).toBeTruthy();
  expect(screen.getByText(/Hearing on Turn 121/)).toBeTruthy();
});
