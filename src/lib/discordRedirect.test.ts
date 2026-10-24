import { afterEach, describe, expect, it } from "vitest";
import { discordRedirectUri } from "./discordRedirect";

const previous = process.env.DISCORD_REDIRECT_URI;

afterEach(() => {
  if (previous === undefined) delete process.env.DISCORD_REDIRECT_URI;
  else process.env.DISCORD_REDIRECT_URI = previous;
});

describe("discordRedirectUri", () => {
  it("moves the www host to the apex the Discord app registers", () => {
    process.env.DISCORD_REDIRECT_URI =
      "https://www.ahousedividedgame.com/api/auth/discord/callback";
    expect(discordRedirectUri()).toBe("https://ahousedividedgame.com/api/auth/discord/callback");
  });

  it("leaves an apex redirect untouched", () => {
    process.env.DISCORD_REDIRECT_URI = "https://ahousedividedgame.com/api/auth/discord/callback";
    expect(discordRedirectUri()).toBe("https://ahousedividedgame.com/api/auth/discord/callback");
  });

  it("leaves local development alone", () => {
    process.env.DISCORD_REDIRECT_URI = "http://localhost:3000/api/auth/discord/callback";
    expect(discordRedirectUri()).toBe("http://localhost:3000/api/auth/discord/callback");
  });

  it("returns undefined when the app is not configured", () => {
    delete process.env.DISCORD_REDIRECT_URI;
    expect(discordRedirectUri()).toBeUndefined();
  });
});
