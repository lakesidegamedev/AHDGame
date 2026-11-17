/** @vitest-environment happy-dom */
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ElectricityNetworkCard } from "./ElectricityNetworkCard";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const json = (mode: string, status = 200) => new Response(JSON.stringify({ mode }), { status });
describe("Electricity mode control", () => {
  it("requires confirmation to enforce and preserves the saved mode after a rejected write", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json("shadow"))
      .mockResolvedValueOnce(json("shadow", 500));
    vi.stubGlobal("fetch", fetcher);
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirm);
    render(<ElectricityNetworkCard />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Shadow Mode" }).getAttribute("aria-pressed")).toBe(
        "true"
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Enforced" }));
    expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Enforced" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Shadow Mode" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(fetcher.mock.calls[1][1].body).toBe(JSON.stringify({ mode: "enforced" }));
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "/control/economy/electricity-network"
    );
  });
  it("can return to Off without an Enforced confirmation", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json("enforced"))
      .mockResolvedValueOnce(json("off"));
    vi.stubGlobal("fetch", fetcher);
    const confirm = vi.fn();
    vi.stubGlobal("confirm", confirm);
    render(<ElectricityNetworkCard />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Off" }).hasAttribute("disabled")).toBe(false)
    );
    fireEvent.click(screen.getByRole("button", { name: "Off" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Off" }).getAttribute("aria-pressed")).toBe("true")
    );
    expect(confirm).not.toHaveBeenCalled();
  });
});
