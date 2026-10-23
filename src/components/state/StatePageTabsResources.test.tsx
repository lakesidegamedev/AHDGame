/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/corporations.json";
const access = vi.hoisted(() => ({ isNationalIssuer: false, isStateIssuer: false }));
vi.mock("@/hooks/useExtractionIssuerAccess", () => ({ useExtractionIssuerAccess: () => access }));
vi.mock("@/hooks/useGameEvents", () => ({ useGameTurnStatus: () => ({ currentTurn: 40 }) }));
vi.mock("@/hooks/useProspectingSurveys", () => ({
  useProspectingSurveys: () => ({ surveys: [], loading: false, refresh: vi.fn() }),
}));
vi.mock("@/components/congress/GrantContractModal", () => ({ GrantContractModal: () => null }));
vi.mock("@/components/extraction/IssueExtractionContractModal", () => ({
  IssueExtractionContractModal: () => null,
}));
vi.mock("@/components/extraction/CommissionSurveyModal", () => ({
  CommissionSurveyModal: () => null,
}));
vi.mock("@/components/extraction/ProspectingSurveyList", () => ({
  ProspectingSurveyList: () => null,
}));
import { ResourcesTab } from "./StatePageTabsResources";
const data = {
  contractIssuanceEnabled: true,
  summary: [
    {
      resource: "oil",
      capacityPerTurn: 1000,
      currentOutput: 100,
      contractedPct: 0.2,
      committedShare: 0.7,
      openAccessPct: 0.8,
    },
  ],
  contracts: [
    {
      _id: "national",
      countryId: "US",
      stateId: "TX",
      resource: "oil",
      share: 0.1,
      grantedByLevel: "national",
      corporationName: "National concession",
    },
    {
      _id: "regional",
      countryId: "US",
      stateId: "TX",
      resource: "oil",
      share: 0.1,
      grantedByLevel: "state",
      corporationName: "Regional concession",
    },
  ],
};
function show() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ResourcesTab stateId="TX" countryId="US" />
    </NextIntlClientProvider>
  );
}
beforeEach(() => {
  access.isNationalIssuer = false;
  access.isStateIssuer = false;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => new Response(JSON.stringify(data)))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("regional concession management", () => {
  it("lets a national issuer revoke only national concessions and includes tender reservations in headroom", async () => {
    access.isNationalIssuer = true;
    show();
    await screen.findByText("National concession");
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(1);
    expect(screen.getByText("5% left")).toBeTruthy();
    expect(screen.getByText("Capacity / day")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      "/api/states/TX/resources?countryId=US",
      expect.objectContaining({ cache: "no-store" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/contracts/extraction/national/revoke", {
        method: "POST",
      })
    );
  });
  it("lets a regional issuer revoke only regional concessions", async () => {
    access.isStateIssuer = true;
    show();
    await screen.findByText("Regional concession");
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/contracts/extraction/regional/revoke", {
        method: "POST",
      })
    );
  });
  it("keeps the public board discoverable without management controls", async () => {
    show();
    await screen.findByText("National concession");
    expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open country contract board" })).toBeTruthy();
  });
  it("recovers from a revoke network failure without leaving the action stuck", async () => {
    access.isNationalIssuer = true;
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(data)))
      .mockRejectedValueOnce(new Error("Connection lost"));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    await screen.findByText("Connection lost");
    expect(screen.getByRole("button", { name: "Revoke" }).hasAttribute("disabled")).toBe(false);
  });
  it("does not turn service failures into an empty-resource message", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 })
    );
    show();
    await screen.findByRole("alert");
    expect(screen.queryByText(/No significant extractable/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("National concession");
  });
});
