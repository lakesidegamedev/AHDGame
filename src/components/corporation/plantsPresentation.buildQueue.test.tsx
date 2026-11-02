/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { BuildQueueBadge, buildProgressLabel, buildQueueBadgeLabel } from "./plantsPresentation";

afterEach(cleanup);

// Ticket #1141: a player saw "+6.9k 38T" beside a FREIGHT pill and asked what
// freight meant in sectors. The pill is the build queue, not freight, and its
// only explanation was a hover title.
const QUEUE = {
  orders: 1,
  unitsOrdered: 6900,
  unitsRemaining: 6900,
  unitsPerTurn: 0,
  lastOnlineTurn: 288,
  nextOnlineTurn: 288,
  turnsRemaining: 38,
};

describe("BuildQueueBadge", () => {
  it("says what it is on its face, not only on hover", () => {
    render(<BuildQueueBadge queue={QUEUE} />);
    expect(screen.getByText("building")).toBeTruthy();
  });

  it("still shows the amount and the turns to the next order", () => {
    render(<BuildQueueBadge queue={QUEUE} />);
    expect(screen.getByText(/6\.9k/)).toBeTruthy();
    expect(screen.getByText(/38T/)).toBeTruthy();
  });

  it("gives a screen reader the same sentence as the tooltip", () => {
    const label = buildQueueBadgeLabel(QUEUE);
    render(<BuildQueueBadge queue={QUEUE} />);
    expect(screen.getByLabelText(label)).toBeTruthy();
    expect(label).toContain("under construction");
    expect(label).toContain("38 turns");
  });

  it("renders nothing when no capacity is on order", () => {
    const { container } = render(
      <BuildQueueBadge
        queue={{
          orders: 0,
          unitsOrdered: 0,
          unitsRemaining: 0,
          unitsPerTurn: 0,
          lastOnlineTurn: null,
          nextOnlineTurn: null,
          turnsRemaining: null,
        }}
      />
    );
    expect(container.textContent).toBe("");
  });

  it("counts plants and shows per-turn arrival when given a plant size", () => {
    // 3.4 plants of 25 units on order, half still to land, ramping in 2 a turn.
    render(
      <BuildQueueBadge
        queue={{
          orders: 1,
          unitsOrdered: 86,
          unitsRemaining: 43,
          unitsPerTurn: 12.5,
          lastOnlineTurn: 539,
          nextOnlineTurn: 539,
          turnsRemaining: 6,
        }}
        plantUnits={25}
      />
    );
    expect(screen.getByText(/\+1\.7 building/)).toBeTruthy();
    expect(screen.getByText(/done turn 539/)).toBeTruthy();
    expect(screen.getByText(/1\.7 of 3\.4 in/)).toBeTruthy();
    expect(screen.getByText(/about 0\.5 a turn/)).toBeTruthy();
  });

  it("shows no per-turn rate for an order that lands whole (ticket 1753)", () => {
    // About 193 units against a 250-unit mine, landing in one piece on turn 614.
    const queue = {
      orders: 1,
      unitsOrdered: 193,
      unitsRemaining: 193,
      unitsPerTurn: 0,
      lastOnlineTurn: 614,
      nextOnlineTurn: 614,
      turnsRemaining: 6,
    };
    render(
      <BuildQueueBadge queue={queue} plantUnits={250} plantSingular="mine" plantPlural="mines" />
    );
    expect(screen.getByText(/\+0\.8 building/)).toBeTruthy();
    expect(screen.getByText(/done turn 614/)).toBeTruthy();
    expect(screen.queryByText(/a turn/)).toBeNull();
    const label = buildProgressLabel(queue, 250, "mine", "mines");
    expect(label).toContain(
      "Capacity arrives in one piece when it is done, not a slice each turn."
    );
    expect(label).not.toContain("whole mines");
    expect(label).not.toContain("rises each turn");
  });

  it("names the turn a stepped order next lands when that is before it is done", () => {
    // Two 100-unit plants over six turns: one lands on turn 3, the last on turn 6.
    const queue = {
      orders: 1,
      unitsOrdered: 200,
      unitsRemaining: 200,
      unitsPerTurn: 0,
      lastOnlineTurn: 6,
      nextOnlineTurn: 6,
      nextArrivalTurn: 3,
      turnsRemaining: 5,
    };
    render(<BuildQueueBadge queue={queue} plantUnits={100} />);
    expect(screen.getByText(/next lands turn 3/)).toBeTruthy();
    expect(screen.queryByText(/a turn/)).toBeNull();
    expect(buildProgressLabel(queue, 100, "plant", "plants")).toContain(
      "Capacity arrives in steps, not a slice each turn: the next lands on turn 3."
    );
  });
});
