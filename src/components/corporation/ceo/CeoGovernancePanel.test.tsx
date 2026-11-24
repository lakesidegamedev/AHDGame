/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CeoGovernancePanel from "./CeoGovernancePanel";
import type { CorporationDetail } from "../CorporationPageTypes";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/contexts/CurrencyContext", async () => {
  const { formatSharePriceFine } = await import("@/lib/utils/formattersCore");
  return {
    useCurrency: () => ({
      formatPriceFine: (n: number) => formatSharePriceFine(n, "$"),
      formatAmount: (n: number) => `$${n}`,
      formatFull: (n: number) => `$${n}`,
      toInternalFrom: (n: number) => n,
    }),
  };
});
vi.mock("@/contexts/RegisteredCountriesContext", () => ({
  useCountryDisplayName: () => (id: string) => id,
  useEnabledCountries: () => [],
}));
vi.mock("@/components/MailComposerModal", () => ({ MailComposerModal: () => null }));
vi.mock("@/components/time/LocalTime", () => ({ LocalTime: () => null }));
vi.mock("../CorporationStructureActions", () => ({ CorporationStructureActions: () => null }));
vi.mock("./CaretakerCeoCard", () => ({ CaretakerCeoCard: () => null }));
vi.mock("./SuperShareAdoptionCard", () => ({ SuperShareAdoptionCard: () => null }));
vi.mock("./TickerChangeCard", () => ({ TickerChangeCard: () => null }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const corporation = {
  _id: "c1",
  name: "Keystone",
  countryId: "US",
  type: "energy",
  isPrivate: true,
  liquidCurrencyCode: "USD",
  headquartersState: "PA",
} as unknown as CorporationDetail;

describe("CeoGovernancePanel", () => {
  it("leave or close holds resign and dissolve", () => {
    render(<CeoGovernancePanel corporation={corporation} corpId="7" onRefresh={vi.fn()} />);
    const group = screen.getByRole("group", { name: "Leave or close" });
    expect(within(group).getByRole("button", { name: "Resign: Resign as CEO" })).toBeTruthy();
    expect(within(group).getByRole("button", { name: "Dissolve: Dissolve" })).toBeTruthy();
    // Private: dissolving winds the corporation up at once.
    expect(
      within(group).getByText("Wind up the corporation and pay out shareholders. Cannot be undone.")
    ).toBeTruthy();
  });

  it("disables the dissolve button with the reason and shows one rate behind the payout", async () => {
    const preview = {
      ...basePreview,
      bondSettlement: { ...bondSettlement, anyDefaulted: true },
      canDissolveSettlingBonds: false,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, preview }) })
    );
    render(<CeoGovernancePanel corporation={corporation} corpId="7" onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Dissolve: Dissolve" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview payout" }));
    await waitFor(() => expect(screen.getByText("Paid per share")).toBeTruthy());
    expect(screen.getByText("$0.7005")).toBeTruthy();
    expect(screen.getByText(/not the book value/)).toBeTruthy();
    const yes = screen.getByRole("button", { name: "Yes, dissolve" });
    expect((yes as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/A bond is in default/)).toBeTruthy();
  });

  it("shows the bond payout and confirms a dissolve that pays bondholders first", async () => {
    const preview = { ...basePreview, bondSettlement, canDissolveSettlingBonds: true };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? { ok: true, json: async () => ({ success: true }) }
        : { ok: true, json: async () => ({ success: true, preview }) }
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<CeoGovernancePanel corporation={corporation} corpId="7" onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Dissolve: Dissolve" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview payout" }));
    await waitFor(() => expect(screen.getByText("Owed to bondholders")).toBeTruthy());
    expect(screen.getByText("Bondholders receive")).toBeTruthy();
    expect(screen.getByText(/1 bond is outstanding/)).toBeTruthy();
    expect(screen.getByText(/Dissolving cannot be undone/)).toBeTruthy();
    expect(screen.getByText(/This cannot be undone/)).toBeTruthy();
    const yes = screen.getByRole("button", { name: "Yes, pay bondholders and dissolve" });
    expect((yes as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(yes);
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true)
    );
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({ settleBonds: true });
  });
});

const bondSettlement = {
  bondCount: 1,
  anyDefaulted: false,
  bondTotalCorp: 500,
  bondholdersGetCorp: 500,
  bondRecoveryPct: 100,
  shareholdersGetCorp: 1000,
};

const basePreview = {
  outstandingBonds: 1,
  canQuickDissolve: false,
  dissolutionAgeTurnsRemaining: 0,
  returnedCapitalCorp: 1000,
  returnedCapitalHome: 1000,
  ceoShareHome: 800,
  ceoShareAnchor: 800,
  ceoIsSoleShareholder: false,
  homeCurrency: "USD",
  forexEnabled: false,
  characterRows: [{ characterId: "a", name: "Holder", shares: 80, payout: 800 }],
  corporateRows: [],
  publicFloatRow: { shares: 20, payout: 200 },
  fundRows: [],
  nppRows: [],
  totalShares: 100,
  perShareCorp: 0.7005,
  corpPerAnchor: 1,
  poolParts: { cash: 600, heldBonds: 0, sectorSalvage: 400, buybackEscrow: 0 },
  sectorSalvageFraction: 0.2,
  commodityGlobalDeltas: [],
};
