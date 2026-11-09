/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NationalHistoryPanel } from "./NationalHistoryPanel";

vi.mock("@/hooks/useGameEvents", () => ({ useGameEvents: () => {} }));

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
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("NationalHistoryPanel", () => {
  beforeEach(() => {
    mockFetch(payload);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the newest value for the default GDP series", async () => {
    render(<NationalHistoryPanel countryId="US" />);
    expect(await screen.findByText("$1.20T")).toBeTruthy();
    expect(screen.getByText(/\+20.0% over window/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /GDP per capita/ })).toBeTruthy();
  });

  it("switches to population and reports its own window change", async () => {
    render(<NationalHistoryPanel countryId="US" />);
    await screen.findByText("$1.20T");
    fireEvent.click(screen.getByRole("button", { name: /Population/ }));
    expect(await screen.findByText("102.00M people")).toBeTruthy();
    expect(screen.getByText(/\+2.0% over window/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Population/ }).getAttribute("aria-pressed")).toBe(
      "true"
    );
  });

  it("renders the compact sparkline form without axis labels", async () => {
    render(<NationalHistoryPanel countryId="US" compact />);
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

    const { rerender } = render(<NationalHistoryPanel countryId="US" />);
    rerender(<NationalHistoryPanel countryId="JP" />);
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
    render(<NationalHistoryPanel countryId="US" />);
    expect(await screen.findByText(/Not enough recorded history yet/)).toBeTruthy();
  });

  it("surfaces a failed request with a retry action", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 }))
    );
    render(<NationalHistoryPanel countryId="US" />);
    expect(await screen.findByText(/Could not load national history/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
