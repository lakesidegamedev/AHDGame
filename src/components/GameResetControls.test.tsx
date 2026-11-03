/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameResetControls } from "./GameResetControls";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const presets = [
  {
    id: "1991-default",
    name: "1991 Start date - Default parties",
    description: "1991 data",
    countries: ["US"],
  },
  {
    id: "2019-default",
    name: "2019 Start date - Default parties",
    description: "2019 data",
    countries: ["US"],
  },
  {
    id: "2019-no-parties",
    name: "2019 Start date - No Parties",
    description: "No parties",
    countries: [],
  },
];
let doneData: Record<string, unknown> = {};
const requests: Array<{ url: string; body: Record<string, unknown> }> = [];

describe("1991 no starting parties picker", () => {
  beforeEach(() => {
    requests.length = 0;
    doneData = { details: {} };
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true)
    );
    vi.stubGlobal(
      "prompt",
      vi.fn(() => "RESET AND BOOTSTRAP")
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          requests.push({ url, body: JSON.parse(String(init.body)) });
          return new Response(`data: ${JSON.stringify({ type: "done", data: doneData })}\n\n`, {
            headers: { "content-type": "text/event-stream" },
          });
        }
        return new Response(JSON.stringify(url.includes("presets") ? { presets } : {}));
      })
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function pick1991() {
    render(<GameResetControls />);
    fireEvent.click(await screen.findByRole("button", { name: "1991" }));
  }

  it("enables No Parties for 1991 and sends the explicit choice without changing the data preset", async () => {
    await pick1991();
    const noParties = screen.getByRole("button", { name: "No Parties" });
    expect(noParties).toHaveProperty("disabled", false);
    fireEvent.click(noParties);
    expect(noParties.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getByText(/Background countries keep their modeled parties and governments/)
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset + no parties" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].url).toContain("preset=1991-default");
    expect(requests[0].body.startingParties).toBe("none");
    expect(vi.mocked(confirm).mock.calls[0][0]).toContain("No starting parties");
    expect(vi.mocked(confirm).mock.calls[0][0]).toContain(
      "background countries keep their governments"
    );
  });

  it("switches back to default parties without carrying over the empty-party choice", async () => {
    await pick1991();
    fireEvent.click(screen.getByRole("button", { name: "No Parties" }));
    fireEvent.click(screen.getByRole("button", { name: "Default parties" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset + historical" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].body.startingParties).toBe("default");
  });

  it("retains the existing 2019 no-parties preset when switching years", async () => {
    await pick1991();
    fireEvent.click(screen.getByRole("button", { name: "No Parties" }));
    fireEvent.click(screen.getByRole("button", { name: "2019" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset + historical" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].url).toContain("preset=2019-no-parties");
    expect(requests[0].body.startingParties).toBeUndefined();
  });
  it("shows blocked readiness and critical checks instead of a green completion message", async () => {
    doneData = {
      resetStatus: "partial",
      readiness: {
        status: "blocked",
        baselineCaptured: false,
        criticalChecks: [{ id: "partyRoster.RU", metric: "parties", note: "missing roster" }],
      },
    };
    await pick1991();
    fireEvent.click(screen.getByRole("button", { name: "Reset + historical" }));
    const message = await screen.findByText(/Reset completed with blocked readiness/);
    expect(message.textContent).toContain("partyRoster.RU: missing roster");
    expect(message.className).toContain("text-red-400");
    expect(message.textContent).toContain("Maintenance remains enabled");
  });
});

describe("reset date fields", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(JSON.stringify(url.includes("presets") ? { presets } : {}))
      )
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("moves the slider and base world when the year and week are typed", async () => {
    render(<GameResetControls />);
    await screen.findByRole("button", { name: "1991" });
    const year = screen.getByLabelText("Reset year") as HTMLInputElement;
    const week = screen.getByLabelText("Reset week") as HTMLInputElement;
    const slider = screen.getByLabelText("Reset year and week") as HTMLInputElement;

    // A partial year stays as typed without moving the date.
    fireEvent.change(year, { target: { value: "19" } });
    expect(year.value).toBe("19");
    expect(slider.getAttribute("aria-valuetext")).toBe("2019, week 1");

    fireEvent.change(year, { target: { value: "1995" } });
    fireEvent.change(week, { target: { value: "12" } });
    expect(slider.value).toBe(String((1995 - 1953) * 48 + 11));
    expect(screen.getByText(/Base world:/).textContent).toContain("1991");

    // Blurring an invalid entry falls back to the committed date.
    fireEvent.change(week, { target: { value: "60" } });
    fireEvent.blur(week);
    expect(week.value).toBe("12");
  });

  it("updates the typed fields when the slider moves", async () => {
    render(<GameResetControls />);
    await screen.findByRole("button", { name: "1991" });
    const slider = screen.getByLabelText("Reset year and week");
    fireEvent.change(slider, { target: { value: String((2000 - 1953) * 48 + 4) } });
    expect((screen.getByLabelText("Reset year") as HTMLInputElement).value).toBe("2000");
    expect((screen.getByLabelText("Reset week") as HTMLInputElement).value).toBe("5");
  });
});
