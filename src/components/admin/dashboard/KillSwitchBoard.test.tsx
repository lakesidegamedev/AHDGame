/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { KillSwitchBoard } from "./KillSwitchBoard";
vi.mock("@/hooks/useGameEvents", () => ({ useGameTurnStatus: () => null }));
vi.mock("@/components/ui", () => ({ Skeleton: () => <div /> }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("Government contracts kill-switch card", () => {
  it("loads the setting, confirms disabling and sends explicit target values", async () => {
    const confirm = vi.fn(() => true);
    const fetch = vi.fn(
      async (_url: string, init?: RequestInit) =>
        new Response(
          JSON.stringify(
            init?.method === "PATCH"
              ? { success: true, enabled: JSON.parse(init.body as string).enabled }
              : { enabled: true, mode: "off" }
          ),
          { status: 200 }
        )
    );
    vi.stubGlobal("confirm", confirm);
    vi.stubGlobal("fetch", fetch);
    render(<KillSwitchBoard />);
    const card = await screen.findByRole("button", { name: /Government contracts/ });
    expect(within(card).getByText("Enabled")).toBeTruthy();
    fireEvent.click(card);
    await within(card).findByText("Disabled");
    expect(confirm).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      "/api/admin/government-contracts",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ enabled: false }) })
    );
    fireEvent.click(card);
    await within(card).findByText("Enabled");
    expect(fetch).toHaveBeenCalledWith(
      "/api/admin/government-contracts",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ enabled: true }) })
    );
  });
});
