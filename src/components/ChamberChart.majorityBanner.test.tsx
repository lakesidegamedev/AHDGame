/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MajorityBanner, type PartySeatsDisplay } from "./ChamberChart";

const party = (party: string, seats: number): PartySeatsDisplay => ({
  party,
  partyName: `Party ${party}`,
  partyColor: "#888",
  economicPosition: 0,
  seats,
});

afterEach(cleanup);

describe("MajorityBanner", () => {
  it("measures the majority against the full chamber, vacancies included", () => {
    const { container } = render(
      <MajorityBanner
        seats={[party("5", 17), party("10", 15), party("__vacant__", 68)]}
        total={100}
        chamberLabel="Senate"
      />
    );
    expect(container.textContent).not.toContain("holds Senate majority");
    expect(container.textContent).toContain("51 needed for majority");
    expect(container.textContent).toContain("68 vacant");
  });

  it("omits the vacancy note for a full chamber", () => {
    const { container } = render(
      <MajorityBanner seats={[party("5", 40), party("10", 60)]} total={100} chamberLabel="Senate" />
    );
    expect(container.textContent).toContain("51 needed)");
    expect(container.textContent).not.toContain("vacant");
  });

  it("uses 218 of 435 for the US House even with seats vacant", () => {
    const { container } = render(
      <MajorityBanner
        seats={[party("5", 215), party("10", 217), party("__vacant__", 3)]}
        total={435}
        chamberLabel="House"
      />
    );
    expect(container.textContent).toContain("218 needed");
  });
});
