/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { sovereignMaturityLadder } from "@/lib/budget/rules/maturityLadder";
import { MaturityLadderPanel } from "./MaturityLadderPanel";

const bond = (principal: number, couponRatePct: number, maturityTurn: number) => ({
  principal,
  couponRatePct,
  maturityTurn,
});

describe("MaturityLadderPanel", () => {
  it("names the year with the most repricing and the year with the widest gap", () => {
    const ladder = sovereignMaturityLadder(
      [bond(100, 4, 110), bond(700, 4.5, 160), bond(200, 1, 244)],
      { currentTurn: 100, todayRatePct: 5 }
    );

    render(<MaturityLadderPanel ladder={ladder} sym="$" />);

    expect(screen.getByText(/FY\+1 reprices the most stock/)).toBeTruthy();
    expect(screen.getByText(/FY\+3 carries the widest gap/)).toBeTruthy();
    expect(screen.queryByText(/within two years/)).toBeNull();
  });

  it("says when the same year carries both, and when no year reprices higher", () => {
    const together = sovereignMaturityLadder([bond(500, 1, 110)], {
      currentTurn: 100,
      todayRatePct: 5,
    });
    const { rerender } = render(<MaturityLadderPanel ladder={together} sym="$" />);
    expect(screen.getByText(/at the widest gap/)).toBeTruthy();

    const cheaper = sovereignMaturityLadder([bond(500, 6, 110)], {
      currentTurn: 100,
      todayRatePct: 5,
    });
    rerender(<MaturityLadderPanel ladder={cheaper} sym="$" />);
    expect(screen.getByText(/no year reprices meaningfully above its own coupons/)).toBeTruthy();
  });
});
