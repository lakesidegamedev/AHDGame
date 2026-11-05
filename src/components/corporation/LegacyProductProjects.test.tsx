/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LegacyProductProjects } from "./LegacyProductProjects";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({ formatAmount: (n: number) => `$${Math.round(n)}` }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(activeProject: Record<string, unknown> | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/media-products")) {
        return new Response(JSON.stringify({ enabled: true, projects: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ enabled: true, activeProject }), { status: 200 });
    })
  );
}

describe("LegacyProductProjects", () => {
  it("shows a running earlier project, its progress and that it uses part of the R&D budget", async () => {
    stubFetch({
      id: "old",
      kindLabel: "Passenger car",
      stage: "development",
      developmentPaidAnchor: 17_895,
      paidThresholdAnchor: 67_301,
    });
    render(<LegacyProductProjects corporationId="c1" currencyCode="USD" />);
    expect(await screen.findByText("$17895 of $67301")).toBeTruthy();
    expect(
      screen.getByText(/Passenger car is still in development\. .*up to 50% of your R&D budget/)
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retire" })).toBeTruthy();
  });

  it("does not mention the R&D budget once the project is past development", async () => {
    stubFetch({
      id: "old",
      kindLabel: "Passenger car",
      stage: "launch",
      developmentPaidAnchor: 100,
      paidThresholdAnchor: 100,
    });
    render(<LegacyProductProjects corporationId="c1" />);
    expect(await screen.findByText("$100 of $100")).toBeTruthy();
    expect(screen.queryByText(/R&D budget/)).toBeNull();
  });

  it("renders nothing with no earlier projects", async () => {
    stubFetch(null);
    const { container } = render(<LegacyProductProjects corporationId="c1" />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.textContent).toBe("");
  });
});
