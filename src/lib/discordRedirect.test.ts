import { afterEach, describe, expect, it } from "vitest";
import { discordRedirectUri } from "./discordRedirect";

const previous = process.env.DISCORD_REDIRECT_URI;

afterEach(() => {
  if (previous === undefined) delete process.env.DISCORD_REDIRECT_URI;
  else process.env.DISCORD_REDIRECT_URI = previous;
});

describe("discordRedirectUri", () => {
  it("sends the www host exactly as configured", () => {
    process.env.DISCORD_REDIRECT_URI =
      "https://www.ahousedividedgame.com/api/auth/discord/callback";
    expect(discordRedirectUri()).toBe(
      "https://www.ahousedividedgame.com/api/auth/discord/callback"
    );
  });

  it("leaves an apex redirect untouched", () => {
    process.env.DISCORD_REDIRECT_URI = "https://ahousedividedgame.com/api/auth/discord/callback";
    expect(discordRedirectUri()).toBe("https://ahousedividedgame.com/api/auth/discord/callback");
  });

  it("trims stray whitespace", () => {
    process.env.DISCORD_REDIRECT_URI = "  http://localhost:3000/api/auth/discord/callback\n";
    expect(discordRedirectUri()).toBe("http://localhost:3000/api/auth/discord/callback");
  });

  it("returns undefined when the app is not configured", () => {
    delete process.env.DISCORD_REDIRECT_URI;
    expect(discordRedirectUri()).toBeUndefined();
    process.env.DISCORD_REDIRECT_URI = "   ";
    expect(discordRedirectUri()).toBeUndefined();
  });
});
