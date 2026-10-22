// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import IndexCommitteePanel from "./IndexCommitteePanel";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: (n: number, code?: string) => `A${Math.round(n)}${code ? ` ${code}` : ""}`,
    formatFull: (n: number) => `A${n}`,
    formatPrice: (n: number) => `A${n}`,
    formatPriceOrder: (n: number) => `A${n}`,
    formatAmountChip: (n: number) => `A${n}`,
    formatListingPrice: (n: number) => `A${n}`,
    // One pound is two anchor units in these tests.
    toInternalFrom: (n: number, code?: string) => (code === "GBP" ? n * 2 : n),
  }),
}));

const committee = {
  seatId: "s1",
  seatName: "Attorney General",
  holderName: null,
  holderIsNpp: false,
  vacant: true,
};

function mockFetch(
  standing: Record<string, unknown>,
  inbox: Record<string, unknown> = { petitions: [] }
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).startsWith("/api/index-petitions") ? inbox : standing),
    }))
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("IndexCommitteePanel", () => {
  it("shows nothing to a viewer who is not the CEO, even when a committee exists", async () => {
    mockFetch({
      committee,
      isCeo: false,
      needsWaiver: true,
      suggestedContributionAnchor: 2_700_000,
      pending: null,
      waiver: null,
    });
    const { container } = render(<IndexCommitteePanel corpId="c1" />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(container.textContent).toBe("");
  });

  it("shows nothing to a CEO whose company already qualifies", async () => {
    mockFetch({
      committee,
      isCeo: true,
      needsWaiver: false,
      suggestedContributionAnchor: 2_700_000,
      pending: null,
      waiver: null,
    });
    const { container } = render(<IndexCommitteePanel corpId="c1" />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(container.textContent).toBe("");
  });

  it("offers the request in plain words to a CEO whose company misses a bar", async () => {
    mockFetch({
      committee,
      isCeo: true,
      needsWaiver: true,
      suggestedContributionAnchor: 2_700_000,
      pending: null,
      waiver: null,
    });
    render(<IndexCommitteePanel corpId="c1" />);
    expect(await screen.findByText("Ask to be included")).toBeTruthy();
    expect(screen.getByText(/Index funds only buy companies above a minimum size/)).toBeTruthy();
  });

  it("shows the office holder their waiting requests", async () => {
    mockFetch(
      {
        committee: null,
        isCeo: false,
        needsWaiver: false,
        suggestedContributionAnchor: 0,
        pending: null,
        waiver: null,
      },
      {
        seat: { seatName: "Attorney General" },
        petitions: [
          {
            id: "p1",
            corporationId: "c2",
            corporationName: "Acme",
            filedAtTurn: 10,
            deadlineAtTurn: 22,
            contributionAnchor: 3_000_000,
          },
        ],
      }
    );
    render(<IndexCommitteePanel corpId="c1" />);
    expect(await screen.findByText(/waiting for you as Attorney General/)).toBeTruthy();
    expect(screen.getByText("Acme")).toBeTruthy();
  });

  const ceoStanding = {
    committee,
    isCeo: true,
    needsWaiver: true,
    suggestedContributionAnchor: 2_700_000,
    pending: null,
    waiver: null,
  };
  const posted = () =>
    vi
      .mocked(fetch)
      .mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");

  it("no ₳ rendered", async () => {
    mockFetch(ceoStanding, {
      petitions: [
        {
          id: "p1",
          corporationId: "x",
          corporationName: "Other",
          filedAtTurn: 1,
          deadlineAtTurn: 9,
          contributionAnchor: 400,
        },
      ],
      seat: { seatName: "Attorney General" },
    });
    const { container } = render(<IndexCommitteePanel corpId="c1" liquidCurrencyCode="GBP" />);
    await screen.findByLabelText("Lobbying contribution, GBP");
    expect(container.textContent).not.toContain("₳");
  });

  it("lobbying fee posts the anchor amount", async () => {
    mockFetch(ceoStanding);
    render(<IndexCommitteePanel corpId="c1" liquidCurrencyCode="GBP" />);
    const input = await screen.findByLabelText("Lobbying contribution, GBP");
    fireEvent.change(input, { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask to be included" }));
    await waitFor(() => expect(posted()).toBeTruthy());
    expect(JSON.parse(String((posted()![1] as RequestInit).body))).toEqual({
      contributionAnchor: 1_000,
    });
  });

  it("files the suggested fee exactly when left untouched", async () => {
    mockFetch(ceoStanding);
    render(<IndexCommitteePanel corpId="c1" liquidCurrencyCode="GBP" />);
    await screen.findByLabelText("Lobbying contribution, GBP");
    fireEvent.click(screen.getByRole("button", { name: "Ask to be included" }));
    await waitFor(() => expect(posted()).toBeTruthy());
    expect(JSON.parse(String((posted()![1] as RequestInit).body))).toEqual({
      contributionAnchor: 2_700_000,
    });
  });
});
