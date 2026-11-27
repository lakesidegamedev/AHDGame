/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MoneyHistoryPanel } from "./MoneyHistoryPanel";
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("keeps the selected wallet's rows and cursor when an older wallet request resolves last", async () => {
  const requests: { resolve: (response: Response) => void }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>((resolve) => requests.push({ resolve })))
  );
  render(<MoneyHistoryPanel />);
  fireEvent.click(screen.getByText("show"));
  fireEvent.click(screen.getByText("personal"));
  fireEvent.click(screen.getByText("campaign"));
  const page = (wallet: string, counterparty: string) =>
    new Response(
      JSON.stringify({
        rows: [
          {
            turn: 1,
            at: "2026-01-01",
            kind: "grant",
            wallet,
            amount: 100,
            currencyCode: "CAD",
            balanceAfter: null,
            counterparty,
          },
        ],
        nextCursor: wallet === "campaign" ? "campaign-cursor" : null,
      }),
      { status: 200 }
    );
  await act(async () => requests[2].resolve(page("campaign", "Campaign receipt")));
  expect(screen.getByText(/Campaign receipt/)).toBeTruthy();
  await act(async () => requests[1].resolve(page("personal", "Stale personal receipt")));
  await act(async () => requests[0].resolve(page("personal", "Stale all receipt")));
  expect(screen.queryByText(/Stale/)).toBeNull();
  expect(screen.getByText("campaign").getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("loadMore")).toBeTruthy();
});
