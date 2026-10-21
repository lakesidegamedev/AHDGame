/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import MarketOverviewPanel from "./MarketOverviewPanel";
import type { CorporationDetail } from "../CorporationPageTypes";

vi.mock("@/lib/observability/fetchJson", () => ({
  fetchJson: vi.fn().mockResolvedValue({ tallies: [], myVote: null }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const corporation = {
  _id: "c1",
  name: "Keystone",
  totalShares: 1_000,
  publicFloat: 100,
  isPrivate: false,
  brandColor: "#336699",
  shareholders: [
    { characterId: "me", name: "Avery Lane", shares: 600, sequentialId: 1 },
    { characterId: "x", name: "Dana Ross", shares: 300, sequentialId: 2 },
  ],
} as unknown as CorporationDetail;

describe("MarketOverviewPanel holders bar", () => {
  it("splits ownership across holders and the market in one bar", () => {
    render(
      <MarketOverviewPanel
        corporation={corporation}
        myCharacterId="me"
        corpId="7"
        onRefresh={vi.fn()}
        setActionError={vi.fn()}
        setActionSuccess={vi.fn()}
      />
    );
    const bar = screen.getByRole("img", { name: /^Ownership:/ });
    expect(bar.querySelectorAll("[data-segment]")).toHaveLength(3);
    const legend = bar.parentElement!;
    expect(within(legend).getByText("Avery Lane (you)")).toBeTruthy();
    expect(within(legend).getByText("On the market")).toBeTruthy();
    expect(within(legend).getByText("60.0%")).toBeTruthy();
  });
});
