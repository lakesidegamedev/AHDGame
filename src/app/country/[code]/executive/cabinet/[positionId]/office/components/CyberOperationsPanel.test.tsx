// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithMessages as render } from "@/lib/test-utils/renderWithMessages";
import { CyberOperationsPanel, type CyberView } from "./CyberOperationsPanel";

const fetchJsonMock = vi.fn();
vi.mock("@/lib/observability/fetchJson", () => ({
  fetchJson: (...args: unknown[]) => fetchJsonMock(...args),
}));

const VIEW: CyberView = {
  turn: 100,
  cost: 1_000_000,
  balance: 5_000_000,
  hasDirector: true,
  targets: [
    {
      countryId: "CN",
      refusal: null,
      odds: { successChance: 0.62, attributionIfSuccess: 0.31, attributionIfFailed: 0.51 },
    },
    { countryId: "RU", refusal: "truce", odds: null },
  ],
  truces: [{ countryId: "RU", untilTurn: 150, byYou: true }],
  operations: [
    { direction: "by_you", countryId: "CN", succeeded: true, attributed: true, turn: 90 },
    { direction: "against_you", countryId: null, succeeded: false, attributed: false, turn: 80 },
  ],
};

function mount() {
  return render(<CyberOperationsPanel countryId="UK" positionId="director_of_intelligence" />);
}

describe("CyberOperationsPanel", () => {
  beforeEach(() => {
    fetchJsonMock.mockResolvedValue(VIEW);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    fetchJsonMock.mockReset();
  });

  it("shows the odds and cost for the chosen target", async () => {
    mount();
    await screen.findByText("Cyber operations");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "CN" } });
    expect(screen.getByText("Chance it gets through: 62%")).toBeTruthy();
    expect(screen.getByText("Chance you are named if it works: 31%")).toBeTruthy();
    expect(screen.getByText("Chance you are named if it is repelled: 51%")).toBeTruthy();
    const launch = screen.getByRole("button", { name: "Launch operation" }) as HTMLButtonElement;
    expect(launch.disabled).toBe(false);
  });

  it("blocks launch during a truce and explains why", async () => {
    mount();
    await screen.findByText("Cyber operations");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "RU" } });
    expect(screen.getByText("A truce is in force with this country.")).toBeTruthy();
    const launch = screen.getByRole("button", { name: "Launch operation" }) as HTMLButtonElement;
    expect(launch.disabled).toBe(true);
  });

  it("lists truces and recent operations, naming a sponsor only when traced", async () => {
    mount();
    await screen.findByText("Cyber operations");
    expect(screen.getByText(/until turn 150 \(declared by you\)/)).toBeTruthy();
    expect(screen.getByText(/Nobody could say who ran it/)).toBeTruthy();
    expect(screen.getByText(/they named your government/)).toBeTruthy();
  });

  it("disables launch when the appropriation cannot cover the cost", async () => {
    fetchJsonMock.mockResolvedValue({ ...VIEW, balance: 10 });
    mount();
    await screen.findByText("Cyber operations");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "CN" } });
    expect(screen.getByText("The appropriation cannot cover this operation.")).toBeTruthy();
    const launch = screen.getByRole("button", { name: "Launch operation" }) as HTMLButtonElement;
    expect(launch.disabled).toBe(true);
  });

  it("posts the launch and stand down actions", async () => {
    const post = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: "The operation got through." }),
    });
    vi.stubGlobal("fetch", post);
    mount();
    await screen.findByText("Cyber operations");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "CN" } });
    fireEvent.click(screen.getByRole("button", { name: "Launch operation" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(JSON.parse(post.mock.calls[0][1].body)).toEqual({
      targetCountryId: "CN",
      action: "launch",
    });
    fireEvent.click(screen.getByRole("button", { name: "Stand down" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(JSON.parse(post.mock.calls[1][1].body).action).toBe("stand_down");
    vi.unstubAllGlobals();
  });
});
