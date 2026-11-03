// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SaleTaxPreview } from "./SaleTaxPreview";
vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({ formatAmount: (n: number) => "$" + n }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows net proceeds and arrears, and hides stale amounts when the quantity changes", async () => {
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const { shares } = JSON.parse(init.body as string) as { shares: number };
    return Response.json({
      grossProceeds: shares * 100,
      withheldTax: shares * 10,
      netProceeds: shares * 90,
      outstandingArrears: 250,
      turn: 1,
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const { rerender } = render(<SaleTaxPreview corpId="test" shares={10} holdingTerm="long" />);
  expect(await screen.findByText("$900")).toBeTruthy();
  expect(screen.getByText("$1000")).toBeTruthy();
  expect(screen.getByText(/Outstanding tax arrears: \$250/)).toBeTruthy();
  rerender(<SaleTaxPreview corpId="test" shares={20} holdingTerm="long" />);
  expect(screen.queryByText("$900")).toBeNull();
  expect(await screen.findByText("$1800")).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
