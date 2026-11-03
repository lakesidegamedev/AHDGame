// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import en from "../../../../messages/en/settings.json";
import de from "../../../../messages/de/settings.json";
import { IdentitySection } from "./IdentitySection";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Discord unlink requirement", () => {
  it("has account messages in both supported translations", () => {
    for (const messages of [en, de]) {
      expect(messages.settings.identity.discordUnlinkRequired).toBeTruthy();
      expect(messages.settings.identity.discordRequirementLoading).toBeTruthy();
      expect(messages.settings.identity.discordRequirementFailed).toBeTruthy();
    }
  });
  it.each([true, false])("reflects the requirement being %s", async (required) => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ discordLinkRequired: required }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <IdentitySection
        character={{ discordId: "123", discordUsername: "Discord user" }}
        onCharacterUpdate={vi.fn()}
      />
    );
    const button = screen.getByRole("button", { name: "identity.unlink" }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(required));
    if (required)
      expect(screen.getByRole("status").textContent).toBe("identity.discordUnlinkRequired");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/signup-methods",
      expect.objectContaining({ cache: "no-store" })
    );
  });
});
