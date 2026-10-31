/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { BuildQueueBadge, buildQueueBadgeLabel } from "./plantsPresentation";

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
});
