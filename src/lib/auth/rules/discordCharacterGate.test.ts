import { describe, it, expect } from "vitest";
import { requiresDiscordForNewCharacter } from "./discordCharacterGate";
describe("Discord linking for new characters", () => {
  it.each([undefined, false, true])("requires a real link only while enabled=%s", (required) => {
    expect(requiresDiscordForNewCharacter(required, undefined)).toBe(required === true);
    expect(requiresDiscordForNewCharacter(required, "")).toBe(required === true);
    expect(requiresDiscordForNewCharacter(required, "  ")).toBe(required === true);
    expect(requiresDiscordForNewCharacter(required, "123456789")).toBe(false);
  });
});
