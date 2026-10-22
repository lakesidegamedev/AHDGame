/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import SnapshotTab from "./SnapshotTab";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: (value: number) => `$${Math.round(value)}`,
    formatPrice: (value: number) => `$${value.toFixed(2)}`,
    toInternalFrom: (value: number) => value,
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SnapshotTab", () => {
  it("snapshot change bar points the right way", async () => {
    const base = { sharePrice: 10, marketCap: 1000, liquidCapital: 500, revenue: 200, income: 40 };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          points: [
            { turn: 1, ...base },
            // Revenue doubles, cash halves, income unchanged.
            { turn: 2, ...base, revenue: 400, liquidCapital: 250 },
          ],
        }),
      })
    );
    render(<SnapshotTab corpId="7" />);
    const bar = async (metric: string) =>
      within((await screen.findByText(metric)).closest("tr")!).queryByRole("img");

    const up = (await bar("Revenue / turn"))!;
    expect(up.getAttribute("data-direction")).toBe("up");
    expect(up.querySelector<HTMLElement>("[data-fill]")!.className).toContain("bg-success");

    const down = (await bar("Liquid capital"))!;
    expect(down.getAttribute("data-direction")).toBe("down");
    expect(down.querySelector<HTMLElement>("[data-fill]")!.className).toContain("bg-error");

    const flat = (await bar("Net income / turn"))!;
    expect(flat.getAttribute("data-direction")).toBe("flat");
    expect(flat.querySelector("[data-fill]")).toBeNull();
  });
});
