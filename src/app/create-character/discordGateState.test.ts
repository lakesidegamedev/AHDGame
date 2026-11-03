import { describe, expect, it } from "vitest";
import { discordGateReducer, initialDiscordGateState } from "./discordGateState";

describe("Discord gate transitions", () => {
  it("reopens a dismissed prompt when the server requires linking again", () => {
    const linked = discordGateReducer(initialDiscordGateState, { type: "linked" });
    const dismissed = discordGateReducer(linked, { type: "dismiss" });
    expect(discordGateReducer(dismissed, { type: "server-required" })).toEqual({
      discordLinked: false,
      discordRequired: true,
      showDiscordPrompt: true,
      discordPromptDismissed: true,
    });
  });

  it("closes an explicit prompt when the requirement is disabled and after linking", () => {
    const required = discordGateReducer(initialDiscordGateState, { type: "server-required" });
    expect(discordGateReducer(required, { type: "requirement", required: false })).toMatchObject({
      discordRequired: false,
      showDiscordPrompt: false,
    });
    expect(discordGateReducer(required, { type: "linked" })).toMatchObject({
      discordLinked: true,
      showDiscordPrompt: false,
    });
  });
});
