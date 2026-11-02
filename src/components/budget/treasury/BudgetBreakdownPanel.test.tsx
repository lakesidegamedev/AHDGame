/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BudgetBreakdownPanel, type BreakdownLine } from "./BudgetBreakdownPanel";

afterEach(cleanup);

// Suggestion 405: opening "Other Spending" should say what it is made of.
const lines: BreakdownLine[] = [
  { id: "healthcare", label: "Healthcare", description: "Health spending.", amount: 600 },
  {
    id: "other",
    label: "Other Spending",
    description: "All remaining spending.",
    amount: 400,
    laws: [{ title: "Space Programme Act", cost: "$300/yr" }],
    parts: [
      { label: "Space Programme Act", amount: 300 },
      { label: "General spending not tied to a law", amount: 100, note: "Running costs." },
    ],
  },
];

function renderPanel(kind: "revenue" | "spending" = "spending") {
  return render(
    <BudgetBreakdownPanel
      kind={kind}
      title="Spending"
      lines={lines}
      total={1_000}
      sym="$"
      countryCode="US"
      grantRecipientLabel="States"
    />
  );
}

describe("BudgetBreakdownPanel parts", () => {
  it("itemises a line's parts with their share when the row is opened", () => {
    renderPanel();
    expect(screen.queryByText("What this line is made of")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Other Spending/ }));
    expect(screen.getByText("What this line is made of")).toBeTruthy();
    expect(screen.getByText("General spending not tied to a law")).toBeTruthy();
    expect(screen.getByText("Running costs.")).toBeTruthy();
    expect(screen.getByText("75.0%")).toBeTruthy();
    expect(screen.getByText("25.0%")).toBeTruthy();
  });

  it("does not list a spending line's laws twice when its parts already name them", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Other Spending/ }));
    expect(screen.queryByText("Driving legislation")).toBeNull();
    expect(screen.getAllByText("Space Programme Act")).toHaveLength(1);
  });

  it("leaves a line without parts as it was", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Healthcare/ }));
    expect(screen.queryByText("What this line is made of")).toBeNull();
  });
});
