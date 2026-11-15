/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en/economyHistory.json";
import { NationalHistoryPanel } from "./NationalHistoryPanel";

interface PanelEvent {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

const gameEvents = vi.hoisted(() => ({
  handler: null as null | ((event: PanelEvent) => void),
}));

vi.mock("@/hooks/useGameEvents", () => ({
  useGameEvents: (handler: (event: PanelEvent) => void) => {
    gameEvents.handler = handler;
  },
}));

const payload = {
  countryId: "US",
  currencyCode: "USD",
  currentTurn: 3,
  turns: 120,
  points: [
    { turn: 1, year: 1991, gdpMillions: 1_000_000, population: 100_000_000, gdpPerCapita: 10 },
    { turn: 2, year: 1991, gdpMillions: 1_100_000, population: 101_000_000, gdpPerCapita: 10.9 },
    { turn: 3, year: 1991, gdpMillions: 1_200_000, population: 102_000_000, gdpPerCapita: 11.8 },
  ],
};

function mockFetch(response: unknown) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) => {
    return new Response(JSON.stringify(response), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPanel(props: { countryId: "US" | "JP"; compact?: boolean }) {
  return render(panel(props));
}

function panel(props: { countryId: "US" | "JP"; compact?: boolean }) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <NationalHistoryPanel {...props} />
    </NextIntlClientProvider>
  );
}

describe("NationalHistoryPanel", () => {
  beforeEach(() => {
    gameEvents.handler = null;
    mockFetch(payload);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the newest value for the default GDP series", async () => {
    renderPanel({ countryId: "US" });
    expect(await screen.findByText("$1.20T")).toBeTruthy();
    expect(screen.getByText(/\+20.0% over window/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /GDP per capita/ })).toBeTruthy();
  });

  it("switches to population and reports its own window change", async () => {
    renderPanel({ countryId: "US" });
    await screen.findByText("$1.20T");
    fireEvent.click(screen.getByRole("button", { name: /Population/ }));
    expect(await screen.findByText(/102\.00M people/)).toBeTruthy();
    expect(screen.getByText(/\+2.0% over window/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Population/ }).getAttribute("aria-pressed")).toBe(
      "true"
    );
  });

  it("renders the compact sparkline form without axis labels", async () => {
    renderPanel({ countryId: "US", compact: true });
    expect(await screen.findByText("$1.20T")).toBeTruthy();
    // The full panel labels the ends of the window; the sparkline drops them.
    expect(screen.queryByText("T1")).toBeNull();
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("GDP across 3");
  });

  it("ignores a late response for a country the panel no longer shows", async () => {
    const deferred: { resolve: (response: Response) => void } = { resolve: () => {} };
    const usResponse = new Promise<Response>((resolve) => {
      deferred.resolve = resolve;
    });
    const japanPayload = {
      ...payload,
      countryId: "JP",
      currencyCode: "JPY",
      points: [
        { turn: 1, year: 1991, gdpMillions: 9_000_000, population: 100_000_000, gdpPerCapita: 10 },
        {
          turn: 2,
          year: 1991,
          gdpMillions: 9_990_000,
          population: 101_000_000,
          gdpPerCapita: 10.9,
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes("/us/")
          ? usResponse
          : Promise.resolve(new Response(JSON.stringify(japanPayload), { status: 200 }))
      )
    );

    const { rerender } = renderPanel({ countryId: "US" });
    rerender(panel({ countryId: "JP" }));
    expect(await screen.findByText(/9\.99T/)).toBeTruthy();

    // The country the panel moved away from resolves after the switch.
    await act(async () => {
      deferred.resolve(new Response(JSON.stringify(payload), { status: 200 }));
    });
    expect(screen.queryByText(/1\.20T/)).toBeNull();
    expect(screen.getByText(/9\.99T/)).toBeTruthy();
  });

  it("explains a thin series instead of drawing a flat zero line", async () => {
    mockFetch({ ...payload, points: [payload.points[0]] });
    renderPanel({ countryId: "US" });
    expect(await screen.findByText(/Not enough recorded history yet/)).toBeTruthy();
  });

  it("surfaces a failed request with a retry action", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 }))
    );
    renderPanel({ countryId: "US" });
    expect(await screen.findByText(/Could not load national history/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("refetches for the completed turn so a pre-turn cached body cannot stick", async () => {
    const fetchMock = mockFetch(payload);
    renderPanel({ countryId: "US" });
    await screen.findByText("$1.20T");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("until=");

    await act(async () => {
      gameEvents.handler?.({ type: "turn_complete", payload: { turn: 4 }, timestamp: "" });
    });

    // The turn in the URL is the cache key, so the request cannot be answered
    // from the entry this page filled before turn 4 finished.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("until=4");
  });
});
