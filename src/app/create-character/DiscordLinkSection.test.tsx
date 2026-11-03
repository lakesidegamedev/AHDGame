// @vitest-environment happy-dom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DiscordLinkSection } from "./DiscordLinkSection";
vi.mock("next/image", () => ({ default: () => null }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("Discord account linking", () => {
  it("shows Optional or Required and detects an OAuth link on return", async () => {
    const linked = vi.fn();
    const popup = vi.spyOn(window, "open").mockReturnValue({} as Window);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ user: { discordId: "123456789" } }) }))
    );
    render(<DiscordLinkSection initialLinked={false} required onLinked={linked} />);
    expect(screen.getByText(/Required before creating a new character/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Link Discord" }));
    expect(popup).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/discord?returnUrl="),
      "discord-account-link"
    );
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(linked).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Discord account linked")).toBeTruthy();
  });
  it("labels linking optional when the gate is off", () => {
    render(<DiscordLinkSection initialLinked={false} />);
    expect(screen.getByText(/Optional. Link now or later/)).toBeTruthy();
  });
});
