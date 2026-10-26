/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NegotiatedSalePanel, {
  premiumRatio,
  type NegotiatedListingData,
} from "./NegotiatedSalePanel";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/time/LocalTime", () => ({ LocalTime: () => <span>soon</span> }));
vi.mock("@/components/PlayerSelector", () => ({
  PlayerSelector: ({ onSelect }: { onSelect: (c: { id: string; name: string }) => void }) => (
    <button type="button" onClick={() => onSelect({ id: "buyer1", name: "Dana Ross" })}>
      pick buyer
    </button>
  ),
}));

const money = {
  fmtLocalFull: (n: number) => `$${Math.round(n).toLocaleString("en-US")}`,
  fmtLocalPrice: (n: number) => `$${n.toFixed(2)}`,
  inputToLocal: (n: number) => n,
  localToDisplay: (n: number) => n,
  inputSymbol: "$",
};

const incoming: NegotiatedListingData = {
  _id: "l1",
  sellerName: "Avery Lane",
  sharesRemaining: 1_000,
  expiresAt: "2026-10-27T00:00:00.000Z",
  isMySelling: false,
  negotiated: {
    buyerCharacterId: "me",
    buyerName: "Me",
    totalPrice: 200_000_000,
    pricePerShare: 200_000,
    marketPriceAtCreation: 58_000,
    isForMe: true,
  },
};

function renderPanel(props: Partial<Parameters<typeof NegotiatedSalePanel>[0]> = {}) {
  return render(
    <NegotiatedSalePanel
      corpId="7"
      corpName="Keystone"
      sharePrice={58_000}
      myCharacterId="me"
      availableShares={0}
      holdingTerm="long"
      listings={[]}
      deals={[]}
      money={money}
      onToast={vi.fn()}
      onChanged={vi.fn().mockResolvedValue(undefined)}
      {...props}
    />
  );
}

describe("premiumRatio", () => {
  it("compares the agreed price with market and ignores missing prices", () => {
    expect(premiumRatio(200, 58)).toBeCloseTo(3.448, 3);
    expect(premiumRatio(10, 0)).toBeNull();
  });
});

describe("NegotiatedSalePanel", () => {
  it("shows the named buyer the deal, flags the premium, and pays the agreed terms", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ success: true }) } as Response);
    vi.stubGlobal("fetch", fetchMock);
    renderPanel({ listings: [incoming] });

    expect(screen.getByText(/offers you a negotiated sale/)).toBeTruthy();
    expect(screen.getByText("$200,000,000")).toBeTruthy();
    expect(screen.getByText("3.45x market")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Pay and take shares" }));
    expect(screen.getByText(/cannot be undone/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pay now" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/corporations/7/shares/listings/l1/offers");
    expect(JSON.parse(String(init.body))).toEqual({ shares: 1_000, pricePerShare: 200_000 });
    vi.unstubAllGlobals();
  });

  it("lets a seller name a buyer and an agreed total, with a live market comparison", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ success: true }) } as Response);
    vi.stubGlobal("fetch", fetchMock);
    renderPanel({ availableShares: 5_000 });

    fireEvent.click(screen.getByRole("button", { name: /Sell to a specific player/ }));
    fireEvent.click(screen.getByRole("button", { name: "pick buyer" }));
    fireEvent.change(screen.getByPlaceholderText(/Up to 5,000/), { target: { value: "1000" } });
    fireEvent.change(screen.getByPlaceholderText(/Market/), { target: { value: "200000000" } });

    expect(screen.getByText("$58,000,000")).toBeTruthy();
    expect(screen.getByText("3.45x market")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Offer to Dana Ross" }));
    fireEvent.click(screen.getByRole("button", { name: "Offer sale" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1].body))).toEqual({
      shares: 1_000,
      holdingTerm: "long",
      negotiated: { buyerCharacterId: "buyer1", totalPrice: 200_000_000 },
    });
    vi.unstubAllGlobals();
  });

  it("shows completed deals to everyone", () => {
    renderPanel({
      deals: [
        {
          ...incoming.negotiated,
          _id: "d1",
          buyerName: "Dana Ross",
          sellerName: "Avery Lane",
          shares: 1_000,
          completedAt: "2026-10-26T00:00:00.000Z",
        },
      ],
    });
    expect(screen.getByText("Completed negotiated sales")).toBeTruthy();
    expect(screen.getByText("Dana Ross")).toBeTruthy();
    expect(screen.getByText("3.45x market")).toBeTruthy();
  });
});
