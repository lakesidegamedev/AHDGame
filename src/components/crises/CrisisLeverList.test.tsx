/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CrisisLeverList } from "./CrisisLeverList";
import { forecastText, sparklinePoints } from "./crisisV2Format";
import type { CrisisV2Lever } from "@/lib/crises/queries/crisisV2View";

const lever = (overrides: Partial<CrisisV2Lever> = {}): CrisisV2Lever => ({
  id: "stimulus",
  label: "Emergency stimulus",
  role: "headOfState",
  mitigation: 6,
  cost: { treasuryCash: 2_000_000, politicalCapital: 2, approval: { group: "all", points: 1 } },
  cooldownTurns: 3,
  viaBill: false,
  needsCorporation: false,
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CrisisLeverList", () => {
  it("renders nothing without levers", () => {
    const { container } = render(<CrisisLeverList crisisId="c1" levers={[]} corporations={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows real costs and cooldown before any click", () => {
    render(<CrisisLeverList crisisId="c1" levers={[lever()]} corporations={[]} />);
    expect(screen.getByText(/from the treasury/)).toBeTruthy();
    expect(screen.getByText(/2 actions/)).toBeTruthy();
    expect(screen.getByText(/1 points of approval/)).toBeTruthy();
    expect(screen.getByText(/waits 3 turns/)).toBeTruthy();
  });

  it("asks for confirmation, posts once, and shows the result", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ success: true }) }));
    vi.stubGlobal("fetch", fetchMock);
    const onPulled = vi.fn();
    render(
      <CrisisLeverList crisisId="c1" levers={[lever()]} corporations={[]} onPulled={onPulled} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Pull" }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByText(/counts next turn/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toEqual([
      "/api/crises/c1/levers",
      expect.objectContaining({ body: JSON.stringify({ leverId: "stimulus" }) }),
    ]);
    expect(onPulled).toHaveBeenCalled();
  });

  it("disables the button while the request is in flight", async () => {
    let release: (v: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((resolve) => (release = resolve)))
    );
    render(<CrisisLeverList crisisId="c1" levers={[lever()]} corporations={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Pull" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    const working = screen.getByRole("button", { name: "Working" }) as HTMLButtonElement;
    expect(working.disabled).toBe(true);
    release({ ok: true, json: async () => ({}) });
    await waitFor(() => expect(screen.getByText(/counts next turn/)).toBeTruthy());
  });

  it("shows the refusal and lets the player try again", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: "You pulled this lever too recently" }),
      }))
    );
    render(<CrisisLeverList crisisId="c1" levers={[lever()]} corporations={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Pull" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Pull" })).toBeTruthy();
  });

  it("reports an emergency bill for legislature levers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ success: true, billId: "b1" }) }))
    );
    render(
      <CrisisLeverList
        crisisId="c1"
        levers={[lever({ viaBill: true, role: "legislature" })]}
        corporations={[]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Raise bill" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByText("Emergency bill raised")).toBeTruthy());
  });

  it("blocks a company lever when the viewer runs no company, and sends the company otherwise", async () => {
    const company = lever({
      id: "relief",
      role: "corpCeo",
      needsCorporation: true,
      cost: { corpCash: 5000 },
    });
    const { unmount } = render(
      <CrisisLeverList crisisId="c1" levers={[company]} corporations={[]} />
    );
    expect((screen.getByRole("button", { name: "Pull" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/run a company/)).toBeTruthy();
    unmount();

    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <CrisisLeverList
        crisisId="c1"
        levers={[company]}
        corporations={[{ id: "corp1", name: "Acme" }]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Pull" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]).toEqual([
      "/api/crises/c1/levers",
      expect.objectContaining({
        body: JSON.stringify({ leverId: "relief", corporationId: "corp1" }),
      }),
    ]);
  });
});

describe("crisisV2Format", () => {
  it("describes the do-nothing forecast in plain words", () => {
    expect(forecastText(40, [])).toBeNull();
    expect(forecastText(40, [42, 50, 61])).toBe("If nobody acts: 40 now, about 61 in 3 turns.");
    expect(forecastText(40, [40.2, 40.4])).toBe("If nobody acts: holds near 40 for 2 turns.");
  });

  it("maps severity onto the sparkline box", () => {
    expect(sparklinePoints([0, 100], 0, 2, 100, 20)).toBe("0.0,20.0 100.0,0.0");
    expect(sparklinePoints([], 0, 0)).toBe("");
  });
});
