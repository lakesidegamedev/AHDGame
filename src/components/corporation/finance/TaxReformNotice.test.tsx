/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TaxReformNotice } from "./TaxReformNotice";

afterEach(cleanup);

describe("tax reform notice", () => {
  it("explains the scheduled start before activation", () => {
    render(<TaxReformNotice corporation={{ currentTurn: 625, passThroughTaxStartTurn: 626 }} />);
    expect(screen.getByText(/Begins on turn 626/)).toBeTruthy();
    expect(screen.getByText(/100% on turn 649/)).toBeTruthy();
  });

  it.each([
    [626, "4.17"],
    [637, "50.00"],
    [648, "95.83"],
  ])("shows the current fraction at turn %i", (currentTurn, percent) => {
    render(<TaxReformNotice corporation={{ currentTurn, passThroughTaxStartTurn: 626 }} />);
    expect(screen.getByText(new RegExp(`Currently applying ${percent}%`))).toBeTruthy();
    expect(screen.getByText(/1\/24/)).toBeTruthy();
    expect(screen.getByText(/not your tax rate/)).toBeTruthy();
  });

  it.each([undefined, Number.NaN])("hides for an absent or invalid activation (%s)", (start) => {
    const { container } = render(
      <TaxReformNotice corporation={{ currentTurn: 626, passThroughTaxStartTurn: start }} />
    );
    expect(container.textContent).toBe("");
  });

  it.each([649, 650])("hides once fully applied at turn %i", (currentTurn) => {
    const { container } = render(
      <TaxReformNotice corporation={{ currentTurn, passThroughTaxStartTurn: 626 }} />
    );
    expect(container.textContent).toBe("");
  });
});
