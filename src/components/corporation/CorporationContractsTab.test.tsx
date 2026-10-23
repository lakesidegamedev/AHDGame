/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/corporations.json";
import CorporationContractsTab from "./CorporationContractsTab";
import { effectiveContractStatus } from "@/components/extraction/types";
vi.mock("@/contexts/CurrencyContext", () => ({ useCurrency: () => ({ formatAmount: String }) }));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/hooks/useGameEvents", () => ({ useGameTurnStatus: () => ({ currentTurn: 40 }) }));
const corpId = "a".repeat(24);
function show(isCeo = true) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CorporationContractsTab corpId={corpId} countryId="US" isCeo={isCeo} />
    </NextIntlClientProvider>
  );
}
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ contracts: [] })))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("extraction contract discovery and lifecycle", () => {
  it("lets a CEO with no contracts discover matching tenders", async () => {
    show();
    await screen.findByText(/No extraction contracts yet/);
    expect(
      screen.getByRole("link", { name: "Open country contract board" }).getAttribute("href")
    ).toBe(`/country/us/government-contracts?tab=active&type=extraction&supplier=${corpId}`);
    expect(screen.getByText(/Without a contract/)).toBeTruthy();
  });
  it("does not apply a private corporation filter for other viewers", async () => {
    show(false);
    await screen.findByText(/No extraction contracts yet/);
    expect(
      screen.getByRole("link", { name: "Open country contract board" }).getAttribute("href")
    ).toBe("/country/us/government-contracts?tab=active&type=extraction");
  });
  it("shows a failed read and retries instead of claiming there are no contracts", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ contracts: [] })));
    show();
    await screen.findByRole("alert");
    expect(screen.queryByText(/No extraction contracts yet/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText(/No extraction contracts yet/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("keeps revoked agreements in history and links active awards to their record", async () => {
    const contract = {
      _id: "b".repeat(24),
      countryId: "US",
      stateId: "TX",
      resource: "oil",
      share: 0.2,
      status: "active",
      expiresTurn: 50,
      royaltyRatePerTurn: 0.01,
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          contracts: [
            { ...contract, tenderId: "d".repeat(24), missedPayments: 2 },
            { ...contract, _id: "c".repeat(24), revokedTurn: 39 },
          ],
        })
      )
    );
    show();
    await screen.findByText("Revoked");
    const tables = screen.getAllByRole("table");
    expect(within(tables[0]).getByText("2 missed payments")).toBeTruthy();
    expect(within(tables[1]).getByText("Revoked")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View award record" }).getAttribute("href")).toContain(
      `tab=awarded&type=extraction&tender=${"d".repeat(24)}`
    );
    await waitFor(() => expect(screen.queryByText("Active")).toBeNull());
  });
  it.each([
    [{ status: "active", revokedTurn: 1 }, "revoked"],
    [{ revokedTurn: 1 }, "revoked"],
    [{ status: "expired", revokedTurn: 1 }, "expired"],
    [{ status: "defaulted", revokedTurn: 1 }, "defaulted"],
    [{ status: "declined", revokedTurn: 1 }, "declined"],
    [{}, "active"],
  ] as const)("resolves terminal state %j as %s", (contract, expected) => {
    expect(effectiveContractStatus(contract)).toBe(expected);
  });

  const activeRow = (over: Record<string, unknown>) => ({
    _id: "e".repeat(24),
    countryId: "US",
    stateId: "TX",
    resource: "oil",
    share: 0.2,
    status: "active",
    expiresTurn: 70,
    royaltyRatePerTurn: 0.01,
    ...over,
  });
  const termBar = async () => {
    await screen.findByText("TX");
    return document.querySelector<HTMLElement>("[data-term-used] [data-fill]");
  };

  it("term bar only with activation and term", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ contracts: [activeRow({ termTurns: 40 })] }))
    );
    show();
    expect(await termBar()).toBeNull();
    cleanup();

    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ contracts: [activeRow({ activatedTurn: 30, termTurns: 40 })] }))
    );
    show();
    const bar = await termBar();
    expect(bar?.style.width).toBe("25%");
    expect(screen.getByText("10 of 40 turns used")).toBeTruthy();
  });

  it("term bar clamps past expiry", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ contracts: [activeRow({ activatedTurn: 0, termTurns: 20 })] }))
    );
    show();
    expect((await termBar())?.style.width).toBe("100%");
    expect(screen.getByText("20 of 20 turns used")).toBeTruthy();
  });
});
