/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { RegionReferendumCampaign } from "./RegionReferendumCampaign";

import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/nav.json";
function render(element: React.ReactNode) {
  return rtlRender(
    <NextIntlClientProvider locale="en" messages={messages}>
      {element}
    </NextIntlClientProvider>
  );
}

function campaignRef(over: Record<string, unknown> = {}) {
  return {
    id: "r1",
    regionId: "NIR",
    kind: "reunification",
    status: "campaigning",
    campaignCloseTurn: 50,
    yesShare: 57,
    ...over,
  };
}

function mockReferendums(referendums: unknown[], currentTurn = 26) {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: async () => ({ referendums, currentTurn }),
  });
}

describe("RegionReferendumCampaign", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders nothing when this region has no campaigning referendum", async () => {
    mockReferendums([campaignRef({ regionId: "SCO" }), campaignRef({ status: "requested" })]);
    const { container } = render(<RegionReferendumCampaign countryId="UK" regionId="NIR" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it.each([
    ["SCO", "independence", "Independence campaign", "/country/uk/referendums/sco"],
    ["WAL", "independence", "Independence campaign", "/country/uk/referendums/wal"],
    ["NIR", "reunification", "Reunification campaign", "/country/uk/referendums/nir"],
  ])("links the active %s campaign to the matching region", async (regionId, kind, title, href) => {
    mockReferendums([campaignRef({ regionId, kind })]);
    render(<RegionReferendumCampaign countryId="UK" regionId={regionId.toLowerCase()} />);
    await screen.findByRole("heading", { name: title });
    expect(screen.getByRole("link", { name: "View campaign" }).getAttribute("href")).toBe(href);
    expect(screen.getAllByRole("link", { name: "View campaign" })).toHaveLength(1);
  });

  it.each(["requested", "granted", "polling", "actuating", "settled", "completed", "cancelled"])(
    "hides the campaign link during %s",
    async (status) => {
      mockReferendums([campaignRef({ status })]);
      const { container } = render(<RegionReferendumCampaign countryId="UK" regionId="NIR" />);
      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      expect(container.firstChild).toBeNull();
    }
  );

  it("does not fetch or show a UK campaign on another country's region page", () => {
    const { container } = render(<RegionReferendumCampaign countryId="US" regionId="NIR" />);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(container.firstChild).toBeNull();
  });

  it("shows the read-only bar and links to the campaign detail page (no inline spend)", async () => {
    mockReferendums([campaignRef()]);
    render(<RegionReferendumCampaign countryId="UK" regionId="NIR" />);
    await waitFor(() => expect(screen.getByText(/Yes 57%/)).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Reunification campaign" })).toBeTruthy();
    expect(screen.getByText("Campaign active")).toBeTruthy();
    expect(screen.getByText(/vote is held on turn 50/)).toBeTruthy();
    const link = screen.getByRole("link", { name: /View Campaign/i });
    expect(link.getAttribute("href")).toBe("/country/uk/referendums/nir");
    // Spending lives on the detail page now — no buttons here.
    expect(screen.queryByRole("button", { name: /Campaign for/i })).toBeNull();
  });
});
