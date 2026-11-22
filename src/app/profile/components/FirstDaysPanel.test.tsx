/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enProfile from "../../../../messages/en/profile.json";
import type { FirstDaysData } from "@/lib/onboarding/firstDays";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/hooks/useGameEvents", () => ({ useGameTurnStatus: () => null }));
vi.mock("@/lib/analytics/capture", () => ({ captureProductEvent: vi.fn(async () => {}) }));

import { FirstDaysPanel } from "./FirstDaysPanel";

const base: FirstDaysData = {
  influence: 0,
  campaigns: 0,
  campaignGoal: 3,
  joinedParty: false,
  enteredRace: false,
  races: [{ id: "r1", label: "State Senate", closesInHours: 5, candidates: 4 }],
  skippedTutorial: false,
};

function renderPanel(
  data: Partial<FirstDaysData> = {},
  campaignCost: { actions: number; funds: string } | null = { actions: 1, funds: "$4,500" }
) {
  return render(
    <NextIntlClientProvider locale="en" messages={enProfile}>
      <FirstDaysPanel
        data={{ ...base, ...data }}
        year={1993}
        campaignCost={campaignCost}
        partiesHref="/country/us/parties"
      />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  router.refresh.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ message: "Campaigned: +1.0 influence" }) }))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FirstDaysPanel", () => {
  it("runs a Campaign from the panel and refreshes the page", async () => {
    renderPanel();
    expect(screen.getByText("Your first days in 1993")).toBeTruthy();
    expect(screen.getByText("1 action and $4,500 in campaign funds")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Campaign at home" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/actions/execute",
      expect.objectContaining({ body: JSON.stringify({ actionType: "campaign" }) })
    );
    expect(screen.getByText("Campaign 1 of 3 done. Campaigned: +1.0 influence")).toBeTruthy();
  });

  it("counts a landed Campaign at once, before the page refresh arrives", async () => {
    renderPanel({ campaigns: 1 });
    expect(screen.getByText("Campaign in your home region (1 of 3)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Campaign at home" }));
    await waitFor(() =>
      expect(screen.getByText("Campaign in your home region (2 of 3)")).toBeTruthy()
    );
    expect(screen.getByText("Campaign 2 of 3 done. Campaigned: +1.0 influence")).toBeTruthy();
  });

  it("shows why a Campaign failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ error: "Not enough actions" }) }))
    );
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign at home" }));
    expect(await screen.findByText(/Not enough actions/)).toBeTruthy();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("shows the pending Campaign and closes the step when the third completion is confirmed", async () => {
    let resolveCampaign!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveCampaign = resolve;
    });
    const submit = vi.fn(() => pending);
    vi.stubGlobal("fetch", submit);
    renderPanel({ campaigns: 2 });

    fireEvent.click(screen.getByRole("button", { name: "Campaign at home" }));
    const button = screen.getByRole("button", { name: "Campaign in progress" });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(button);
    expect(submit).toHaveBeenCalledTimes(1);

    resolveCampaign(Response.json({ message: "Campaigned: +1.0 influence" }));
    expect(await screen.findByText("Campaign 3 of 3 done. Campaigned: +1.0 influence")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /campaign at home/i })).toBeNull();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("lists open races with when they close", () => {
    renderPanel();
    expect(screen.getByRole("link", { name: "State Senate" }).getAttribute("href")).toBe(
      "/campaign-manager?race=r1"
    );
    expect(screen.getByText("closes in 5 hours, 4 candidates")).toBeTruthy();
  });

  it("asks the player to check progress when a submitted result cannot be confirmed", async () => {
    const submit = vi.fn(async () => {
      throw new Error("Connection lost");
    });
    vi.stubGlobal("fetch", submit);
    renderPanel({ campaigns: 2 });

    fireEvent.click(screen.getByRole("button", { name: "Campaign at home" }));
    expect(await screen.findByText(/refresh and check your progress/i)).toBeTruthy();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(router.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Campaign at home" })).toHaveProperty(
      "disabled",
      false
    );
  });

  it("explains when no race is open", () => {
    renderPanel({ races: [] });
    expect(screen.getByText(/No local race is taking candidates/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Browse elections" }).getAttribute("href")).toBe(
      "/elections"
    );
  });

  it("links to Actions instead of spending funds when a price is unavailable", () => {
    renderPanel({}, null);
    expect(screen.queryByRole("button", { name: "Campaign at home" })).toBeNull();
    expect(screen.getByRole("link", { name: "All actions" }).getAttribute("href")).toBe("/actions");
  });

  it("hides the Campaign button once the goal is met and offers skippers the short tour", () => {
    renderPanel({ campaigns: 3, skippedTutorial: true });
    expect(screen.queryByRole("button", { name: "Campaign at home" })).toBeNull();
    expect(screen.getByRole("link", { name: "two-minute basics" }).getAttribute("href")).toBe(
      "/tutorial"
    );
  });
});
