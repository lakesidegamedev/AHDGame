/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { SingleChamberParliamentPage } from "./SingleChamberParliamentPage";
import type { CountryId } from "@/lib/constants/countriesCore";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

function jsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(totalSeats: number) {
  global.fetch = vi.fn().mockImplementation((url: unknown) => {
    const u = String(url);
    if (u.includes("/members"))
      return Promise.resolve(
        jsonResponse({
          totalSeats,
          filledSeats: 0,
          vacantSeats: totalSeats,
          composition: [],
          members: [],
        })
      );
    if (u.includes("/bills"))
      return Promise.resolve(
        jsonResponse({ bills: [], canPropose: false, adminOverride: false, total: 0 })
      );
    if (u.includes("/leaders"))
      return Promise.resolve(jsonResponse({ primeMinister: null, oppositionLeader: null }));
    return Promise.resolve(jsonResponse({}));
  }) as unknown as typeof fetch;
}

async function showLeadership(countryId: CountryId, title: string) {
  render(<SingleChamberParliamentPage countryId={countryId} />);
  await waitFor(() => expect(screen.getAllByText(title).length).toBeGreaterThan(0));
  screen.getByRole("button", { name: "Leadership" }).click();
}

describe("SingleChamberParliamentPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("gives independent Quebec its National Assembly led by a Premier", async () => {
    mockFetch(125);
    await showLeadership("QC", "National Assembly");
    expect(screen.getByText(/125 MNAs · Regional proportional representation/)).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByText(/The Premier is nominated by National Assembly and leads the government/)
      ).toBeTruthy()
    );
    expect(screen.queryByText(/coming soon/)).toBeNull();
  });

  it("shows Canada's House of Commons at its live size after Quebec leaves", async () => {
    mockFetch(265);
    await showLeadership("CA", "House of Commons");
    expect(screen.getByText(/265 MPs/)).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText(/The Prime Minister is nominated by House of Commons/)).toBeTruthy()
    );
  });

  it("keeps Scotland's First Minister and MSPs", async () => {
    mockFetch(129);
    await showLeadership("SCO", "Scottish Parliament");
    expect(screen.getByText(/129 MSPs · Additional Member System/)).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByText(/The First Minister is nominated by Scottish Parliament/)
      ).toBeTruthy()
    );
  });
});
