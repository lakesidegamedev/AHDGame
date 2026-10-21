/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QuoteBoard } from "./QuoteBoard";
import { CorporationMasthead } from "../CorporationMasthead";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: (n: number) => `$${Math.round(n)}`,
    formatFull: (n: number) => `$${Math.round(n)}.00`,
    formatListingPrice: (n: number) => `$${n.toFixed(2)}`,
    formatPrice: (n: number) => `$${n.toFixed(2)}`,
    toInternalFrom: (n: number) => n,
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/HeroImage", () => ({ HeroImage: () => null }));
vi.mock("@/components/Avatar", () => ({ Avatar: () => null }));
vi.mock("../ceo/CeoCorporationSettingsModal", () => ({ CeoCorporationSettingsModal: () => null }));

const money = {
  code: "USD" as const,
  toAnchor: (n: number) => n,
  fmt: (n: number) => `$${Math.round(n)}`,
  fmtFull: (n: number) => `$${Math.round(n)}.00`,
  fmtSigned: (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}$${Math.round(Math.abs(n))}`,
  fmtPrice: (n: number) => `$${n.toFixed(2)}`,
};

describe("QuoteBoard", () => {
  it("shows the spread only with an active pool", () => {
    const { rerender } = render(
      <QuoteBoard
        money={money}
        price={42.18}
        series={[]}
        dayChange={null}
        bid={42.05}
        ask={42.31}
        poolActive
      />
    );
    expect(screen.getByText("Spread")).toBeTruthy();
    expect(screen.getByText("$0.26")).toBeTruthy();
    rerender(
      <QuoteBoard
        money={money}
        price={42.18}
        series={[]}
        dayChange={null}
        bid={42.05}
        ask={42.31}
        poolActive={false}
      />
    );
    expect(screen.queryByText("Spread")).toBeNull();
  });

  it("range uses the series low and high", () => {
    render(
      <QuoteBoard
        money={money}
        price={45}
        series={[40, 38, 45]}
        dayChange={null}
        poolActive={false}
      />
    );
    expect(screen.getByText("3 turns")).toBeTruthy();
    expect(screen.getByText(/Low \$38\.00/)).toBeTruthy();
    expect(screen.getByText(/High \$45\.00/)).toBeTruthy();
  });

  it("states the change against the previous turn in money and percent", () => {
    render(
      <QuoteBoard
        money={money}
        price={42.18}
        series={[41.42, 42.18]}
        dayChange={{ changePct: 1.84, prevClose: 41.42 }}
        poolActive={false}
      />
    );
    expect(screen.getByText(/1\.84%/)).toBeTruthy();
    expect(screen.getByText(/\+\$0\.76 on prev\. turn/)).toBeTruthy();
  });
});

const privateCorp = {
  _id: "c1",
  sequentialId: 7,
  name: "Keystone Industries Holding Company of Greater Pennsylvania",
  tickerSymbol: "KSTN",
  type: "manufacturing",
  typeLabel: "Manufacturing",
  secondaryType: null,
  countryId: "US",
  headquartersState: "PA",
  headquartersStateName: "Pennsylvania",
  isPrivate: true,
  liquidCapital: 2_900_000,
  liquidCurrencyCode: "USD",
  sharePrice: 24.74,
  marketCapitalization: 247_000_000,
  totalShares: 10_000_000,
  publicFloat: 0,
  dividendRate: 5,
  marketingStrength: 12.94,
  averageQuality: 72,
  ceoVacant: false,
};

function renderPrivateOutsider() {
  return render(
    <CorporationMasthead
      corporation={privateCorp as never}
      ceo={{ name: "Avery Lane", sequentialId: 1, profilePath: "/character/1" } as never}
      isCeo={false}
      corpId="7"
      exchangeLabel="NYSE"
      creditRating="AA"
      retainedDaily={null}
      netIncomeDaily={null}
      revenueGrowth={{ pct: 3.2, realized: true }}
      effectiveDividendRate={5}
      periodView="turn"
      financialFogOfWar={null}
      ceoIsInactive={false}
      onRefresh={vi.fn()}
    />
  );
}

describe("CorporationMasthead ledger", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ history: [] }) })
    );
  });

  it("figures toggle counts the cells shown to this viewer", () => {
    renderPrivateOutsider();
    const toggle = screen.getByRole("button", { name: "All 7 figures" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: "Fewer figures" }).getAttribute("aria-expanded")
    ).toBe("true");
  });

  it("name truncates on narrow screens", () => {
    renderPrivateOutsider();
    const name = screen.getByRole("heading", { level: 1 });
    expect(name.className).toContain("truncate");
    expect(name.parentElement!.className).toContain("min-w-0");
  });

  it("falls back to ticker initials when there is no logo", () => {
    renderPrivateOutsider();
    expect(screen.getByText("KSTN", { selector: "[data-logo-tile]" })).toBeTruthy();
  });
});
