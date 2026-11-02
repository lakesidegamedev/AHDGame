// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithElectionsMessages } from "@/lib/test-utils/renderWithElectionsMessages";
import { PollingChart } from "./PollingChart";

afterEach(cleanup);

const lines = [
  { id: "a", name: "Ann", color: "#2563eb" },
  { id: "b", name: "Bo", color: "#dc2626" },
];

describe("PollingChart", () => {
  it("says so when there is no history yet", () => {
    renderWithElectionsMessages(<PollingChart series={[]} lines={lines} turnLabel="turn" />);
    expect(screen.getByText("No polling history yet.")).toBeTruthy();
  });

  it("shows a turn's values on hover", () => {
    renderWithElectionsMessages(
      <PollingChart
        series={[
          { turn: 8, shares: { a: 50, b: 50 } },
          { turn: 9, shares: { a: 52.4, b: 47.6 } },
        ]}
        lines={lines}
        turnLabel="turn"
      />
    );
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Turn 9" }));
    expect(screen.getByText("Ann 52.4%")).toBeTruthy();
    expect(screen.getByText("Bo 47.6%")).toBeTruthy();
  });

  it("labels a primary's counts in order rather than by turn", () => {
    renderWithElectionsMessages(
      <PollingChart series={[{ turn: 1, shares: { a: 60 } }]} lines={lines} turnLabel="count" />
    );
    expect(screen.getByRole("button", { name: "Count 1" })).toBeTruthy();
  });
});
