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
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ user: { id: "account-a", discordId: "123456789" } }),
      }))
    );
    render(
      <DiscordLinkSection
        expectedUserId="account-a"
        initialLinked={false}
        required
        onLinked={linked}
      />
    );
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
  it.each([undefined, "other-discord"])(
    "stops on an account switch even when Discord is %s",
    async (discordId) => {
      const linked = vi.fn();
      const changed = vi.fn();
      const fetcher = vi.fn(async () => ({
        ok: true,
        json: async () => ({ user: { id: "account-b", discordId } }),
      }));
      vi.stubGlobal("fetch", fetcher);
      render(
        <DiscordLinkSection
          expectedUserId="account-a"
          initialLinked={false}
          onLinked={linked}
          onAccountChanged={changed}
        />
      );
      fireEvent(window, new Event("focus"));
      await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
      expect(linked).not.toHaveBeenCalled();
      expect(screen.getByRole("alert").textContent).toContain("signed-in account changed");
      expect(screen.queryByRole("button", { name: "Link Discord" })).toBeNull();
      fireEvent(window, new Event("focus"));
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  );
  it("does not accept a linked response without an account identity", async () => {
    const linked = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ user: { discordId: "123" } }) }))
    );
    render(
      <DiscordLinkSection expectedUserId="account-a" initialLinked={false} onLinked={linked} />
    );
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(linked).not.toHaveBeenCalled();
  });
  it("retries a failed lookup without falsely reporting a link", async () => {
    const linked = vi.fn();
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({
        ok: true,
        json: async () => ({ user: { id: "account-a", discordId: "123" } }),
      });
    vi.stubGlobal("fetch", fetcher);
    render(
      <DiscordLinkSection expectedUserId="account-a" initialLinked={false} onLinked={linked} />
    );
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(linked).toHaveBeenCalledTimes(1));
  });
  it("detects a switch after the page initially showed a linked account", async () => {
    const changed = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ user: { id: "account-b", discordId: "123" } }),
      }))
    );
    render(
      <DiscordLinkSection expectedUserId="account-a" initialLinked onAccountChanged={changed} />
    );
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  });
  it("labels linking optional when the gate is off", () => {
    render(<DiscordLinkSection expectedUserId="account-a" initialLinked={false} />);
    expect(screen.getByText(/Optional. Link now or later/)).toBeTruthy();
  });
});
