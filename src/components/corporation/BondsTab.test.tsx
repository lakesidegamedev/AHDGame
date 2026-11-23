/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import BondsTab from "./BondsTab";
import type { BondInfo, CorporationDetail, Financials } from "./CorporationPageTypes";
import { MIN_BOND_ISSUANCE_PER_ISSUE } from "@/lib/constants/bonds";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: (value: number) => `A${Math.round(value)}`,
    formatFull: (value: number) => `A${Math.round(value)}`,
    formatAmountIn: (value: number) => `A${Math.round(value)}`,
    toInternalFrom: (value: number) => value,
    displayCurrencyPreference: "local",
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("./bonds/BondHistoryPanel", () => ({ default: () => null }));
vi.mock("./finance/BondMaturityTimeline", () => ({ BondMaturityTimeline: () => null }));
vi.mock("./PrimaryUnderwritingMandateControl", () => ({
  PrimaryUnderwritingMandateControl: () => null,
}));

const corporation = {
  liquidCapital: 1_000_000,
  shareholders: [],
  totalShares: 0,
  isPrivate: true,
} as unknown as CorporationDetail;

const bondInfo = {
  bonds: [],
  imfFacility: null,
  totalDebt: 0,
  isCeo: true,
  cooldownTurnsRemaining: 0,
  currentTurn: 10,
  minIssuance: 40_000,
  maxPerIssuance: 500_000_000,
  maxAllowedIssuance: 2_000_000,
  bondsAvailable: true,
  bondUnitFaceAnchor: 1_000,
  creditRating: {
    rating: "A",
    effectiveCouponRate: 5,
    couponRatesByDuration: { 96: 5, 240: 6, 336: 7 },
  },
} as unknown as BondInfo;

function renderTab() {
  return render(
    <BondsTab
      bondInfo={bondInfo}
      bondLoading={false}
      corpId="c"
      corporation={corporation}
      onRefresh={vi.fn()}
      financials={null as unknown as Financials}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BondsTab issuance", () => {
  it("states the real per-issue cap rule including the floor", () => {
    renderTab();
    const row = screen.getByText("Per-issue cap");
    const tip = row.closest("[title]")?.getAttribute("title") ?? row.getAttribute("title") ?? "";
    const all = document.querySelector(`[title*="25% of annual revenue"]`)?.getAttribute("title");
    expect(tip + (all ?? "")).toContain("25% of annual revenue");
    expect(all).toContain(`A${MIN_BOND_ISSUANCE_PER_ISSUE}`);
  });

  it("leads with the amount that can be issued now and names the binding limit", () => {
    renderTab();
    expect(screen.getByText("You can issue now")).toBeTruthy();
    expect(screen.getByText(/Limited by /)).toBeTruthy();
    expect(screen.queryByText("Largest issue now")).toBeNull();
  });

  it("offers the server minimum, lowered for a small corporation", () => {
    renderTab();
    const button = screen.getByRole("button", { name: "Issue bonds" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/Minimum/).textContent).toContain("A40000");
  });

  it("enables the issue button at a valid amount and clears a stale refusal", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({
          error: "faceValue: Minimum bond issuance is ₳100,000",
          code: "BAD_REQUEST",
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderTab();
    const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "150000" } });
    const button = screen.getByRole("button", { name: "Issue bonds" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    const msg = await screen.findByText("Minimum bond issuance is ₳100,000");
    expect(msg.textContent).not.toContain("faceValue");
    expect(msg.textContent).not.toContain("BAD_REQUEST");
    fireEvent.change(slider, { target: { value: "200000" } });
    expect(screen.queryByText("Minimum bond issuance is ₳100,000")).toBeNull();
  });
});
