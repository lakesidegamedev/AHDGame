import { describe, expect, it } from "vitest";
import { containsDiscordInvite, neutraliseDiscordInvites } from "./agendaText";

describe("agenda invite handling", () => {
  it("detects invite variants", () => {
    for (const t of [
      "https://discord.gg/TKHYZxbVqe",
      "discord.gg/abc",
      "see https://discord.com/invite/abc-1 now",
      "http://www.discordapp.com/invite/xyz",
    ]) {
      expect(containsDiscordInvite(t)).toBe(true);
    }
    expect(containsDiscordInvite("Cut taxes and win")).toBe(false);
    expect(containsDiscordInvite("discord is great")).toBe(false);
  });
  it("replaces invites but keeps other text", () => {
    expect(neutraliseDiscordInvites("Join https://discord.gg/TKHYZxbVqe today")).toBe(
      "Join [invite link removed] today"
    );
    expect(neutraliseDiscordInvites("Plain text")).toBe("Plain text");
  });
});
