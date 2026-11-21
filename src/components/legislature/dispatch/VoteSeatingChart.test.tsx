/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { VoteSeatingChart } from "./VoteSeatingChart";

afterEach(cleanup);

describe("floor vote passage", () => {
  it("counts Ayes against Nays instead of all House seats", () => {
    render(
      <VoteSeatingChart
        style="hemicycle"
        eligible={435}
        votes={{ for: 191, against: 0, abstain: 189 }}
        passRule="majority"
      />
    );

    expect(screen.getByText("This tally meets the passage rule")).toBeTruthy();
    expect(screen.getByText(/191 Ayes out of 191 votes for or against/)).toBeTruthy();
    expect(screen.queryByText(/51% needed/)).toBeNull();
  });

  it("counts a tied majority as one more Aye short", () => {
    render(
      <VoteSeatingChart
        style="hemicycle"
        eligible={33}
        votes={{ for: 9, against: 9, abstain: 4 }}
        passRule="majority"
      />
    );

    expect(screen.getByText("1 more Aye needed at the current Nay count")).toBeTruthy();
  });

  it("reports the extra votes needed for two thirds as the denominator grows", () => {
    render(
      <VoteSeatingChart
        style="hemicycle"
        eligible={435}
        votes={{ for: 190, against: 100, abstain: 80 }}
        passRule="twoThirds"
      />
    );

    expect(screen.getByText("10 more Ayes needed at the current Nay count")).toBeTruthy();
  });
});
