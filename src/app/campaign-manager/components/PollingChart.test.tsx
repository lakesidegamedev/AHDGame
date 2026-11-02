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

  it("shows a tooltip with each name, share and counted votes on hover", () => {
    renderWithElectionsMessages(
      <PollingChart
        series={[
          { turn: 8, shares: { a: 50, b: 50 } },
          { turn: 9, shares: { a: 52.4, b: 47.6 }, votes: { a: 5240, b: 4760 } },
        ]}
        lines={lines}
        turnLabel="turn"
      />
    );
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Turn 9" }));
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("Turn 9");
    expect(tip.textContent).toContain("Ann");
    expect(tip.textContent).toContain("52.4%");
    expect(tip.textContent).toContain("5,240 votes");
    expect(tip.textContent).toContain("47.6%");
    fireEvent.mouseLeave(screen.getByRole("img").parentElement!);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows shares alone where a turn has no counted votes", () => {
    renderWithElectionsMessages(
      <PollingChart
        series={[{ turn: 1, shares: { a: 60, b: 40 } }]}
        lines={lines}
        turnLabel="count"
      />
    );
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Count 1" }));
    expect(screen.getByRole("tooltip").textContent).not.toContain("votes");
  });

  it("draws at a fixed height whatever the width", () => {
    renderWithElectionsMessages(
      <PollingChart series={[{ turn: 1, shares: { a: 60 } }]} lines={lines} turnLabel="turn" />
    );
    expect(screen.getByRole("img").getAttribute("height")).toBe("200");
  });

  it("labels a primary's counts in order rather than by turn", () => {
    renderWithElectionsMessages(
      <PollingChart series={[{ turn: 1, shares: { a: 60 } }]} lines={lines} turnLabel="count" />
    );
    expect(screen.getByRole("button", { name: "Count 1" })).toBeTruthy();
  });
});
