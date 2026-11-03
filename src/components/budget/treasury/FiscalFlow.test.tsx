/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FiscalFlow, groupFlowLines } from "./FiscalFlow";

afterEach(cleanup);

// Suggestion 405: the Japanese budget showed "Other Revenue" (a real line) and
// "Other revenue" (the chart's bucket of small lines) side by side, and neither
// said what was in it.
const revenue = [
  { label: "Income Tax", value: 900 },
  { label: "Social Insurance", value: 300 },
  { label: "Consumption Tax", value: 120 },
  { label: "Corporate Tax — Domestic", value: 90 },
  { label: "Other Revenue", value: 60 },
  { label: "Stamp Duty", value: 20 },
  { label: "Tariffs", value: 10 },
];
const spending = [
  { label: "Healthcare", value: 500 },
  { label: "National Transfers", value: 200 },
  { label: "Education", value: 150 },
  { label: "Economic", value: 100 },
  { label: "Public Works", value: 80 },
  { label: "Defense", value: 60 },
  { label: "Other Spending", value: 40 },
  { label: "Debt Service", value: 30 },
];

function renderFlow() {
  return render(
    <FiscalFlow
      revenue={revenue}
      spending={spending}
      revenueTotal={1_500}
      spendingTotal={1_160}
      sym="¥"
      fiscalYear={2001}
      accent="#d8b25e"
    />
  );
}

describe("groupFlowLines", () => {
  it("keeps the largest lines and folds the rest into a counted group", () => {
    const groups = groupFlowLines(revenue, 5, ["#000"], "sources");
    expect(groups.map((g) => g.label)).toEqual([
      "Income Tax",
      "Social Insurance",
      "Consumption Tax",
      "Corporate Tax — Domestic",
      "Other Revenue",
      "Smaller sources (2)",
    ]);
    expect(groups[5].value).toBe(30);
    expect(groups[5].members).toEqual([
      { label: "Stamp Duty", value: 20 },
      { label: "Tariffs", value: 10 },
    ]);
  });

  it("never names the group like a real Other line", () => {
    const labels = groupFlowLines(revenue, 5, ["#000"], "sources").map((g) => g.label);
    expect(labels.filter((l) => /^other/i.test(l))).toEqual(["Other Revenue"]);
  });

  it("adds no group when every line fits", () => {
    const groups = groupFlowLines(revenue.slice(0, 3), 5, ["#000"], "sources");
    expect(groups.some((g) => g.members)).toBe(false);
  });

  it("keeps full labels for the grouped lines", () => {
    const long = [
      { label: "A", value: 10 },
      { label: "Individual Income Tax (个人所得税) with a very long name", value: 1 },
    ];
    const [, group] = groupFlowLines(long, 1, ["#000"], "sources");
    expect(group.members?.[0].label).toBe(
      "Individual Income Tax (个人所得税) with a very long name"
    );
  });
});

describe("FiscalFlow grouped bars", () => {
  it("lists the lines inside a group when it is clicked, and hides them on a second click", () => {
    renderFlow();
    const group = screen.getByRole("button", { name: /Smaller outlays \(2\)/ });
    expect(group.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Debt Service")).toBeNull();

    fireEvent.click(group);
    expect(group.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Other Spending")).toBeTruthy();
    expect(screen.getByText("Debt Service")).toBeTruthy();

    fireEvent.click(group);
    expect(screen.queryByText("Debt Service")).toBeNull();
  });

  it("says Hide while open and keeps a hint on how to close the list", () => {
    renderFlow();
    const group = screen.getByRole("button", { name: /Smaller outlays \(2\)/ });
    expect(group.getAttribute("aria-label")).toMatch(/Show the lines/);
    expect(screen.getByText(/to see the lines inside it/)).toBeTruthy();

    fireEvent.click(group);
    expect(group.getAttribute("aria-label")).toMatch(/Hide the lines/);
    expect(screen.getByText(/same bar again to close this list/)).toBeTruthy();
  });

  it("opens a group from the keyboard", () => {
    renderFlow();
    const group = screen.getByRole("button", { name: /Smaller sources \(2\)/ });
    fireEvent.keyDown(group, { key: "Enter" });
    expect(screen.getByText("Stamp Duty")).toBeTruthy();
    expect(screen.getByText("Tariffs")).toBeTruthy();
  });

  it("makes only the grouped bars interactive", () => {
    renderFlow();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});
