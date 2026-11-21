/** @vitest-environment happy-dom */
import { render, screen } from "@testing-library/react";
import { it, expect } from "vitest";
import { PrimaryScoreDetails } from "./PrimaryScoreDetails";

it("prints the current score and breaks out the adjustments", () => {
  const { container } = render(
    <PrimaryScoreDetails
      breakdown={{
        alignment: 37,
        favorability: 27.6,
        influence: 19,
        infamyAdjustment: 0,
        nppAdjustment: -41.8,
        score: 41.8,
      }}
    />
  );

  expect(screen.getByText("41.8 points now · See breakdown")).toBeTruthy();
  expect(screen.getByText("37 of 40")).toBeTruthy();
  expect(screen.getByText("-41.8")).toBeTruthy();
  expect(screen.queryByText("Infamy")).toBeNull();
  expect(container.querySelector("details")?.open).toBe(false);
});
