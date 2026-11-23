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

it("shows cost basis, gain and rate beside the tax withheld", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        grossProceeds: 528,
        withheldTax: 122,
        netProceeds: 406,
        taxBreakdown: {
          costBasis: 0,
          shortTermGain: 0,
          longTermGain: 528,
          shortTermRatePct: 30,
          longTermRatePct: 23,
          shortTermTax: 0,
          longTermTax: 122,
        },
        outstandingArrears: 0,
        turn: 1,
      })
    )
  );
  render(<SaleTaxPreview corpId="test" shares={100} holdingTerm="long" />);
  expect(await screen.findByText(/Long-term gain at 23%/)).toBeTruthy();
  expect(screen.getByText("Cost basis of the shares sold")).toBeTruthy();
  expect(screen.getByText("$528 gives $122")).toBeTruthy();
});
