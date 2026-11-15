import { afterEach, describe, expect, it } from "vitest";
import type * as Sentry from "@sentry/nextjs";
import {
  getClientPlayerContext,
  playerContextFromAuthUser,
  setClientPlayerContext,
} from "./clientPlayerContext";
import { withPlayerContext } from "./initSentryClient";

afterEach(() => setClientPlayerContext(null));

describe("client player context for error reports", () => {
  it("takes only opaque ids, country and staff flag from the auth payload", () => {
    const ctx = playerContextFromAuthUser({
      id: "u1",
      username: "PlayerName",
      email: "p@example.com",
      isModerator: true,
      character: { id: "c1", name: "Someone", countryId: "CA" },
    });
    expect(ctx).toEqual({ userId: "u1", characterId: "c1", countryId: "CA", staff: true });
    expect(playerContextFromAuthUser(null)).toBeNull();
    expect(playerContextFromAuthUser({ username: "no id" })).toBeNull();
  });

  it("tags reported errors with the signed-in player and nothing when signed out", () => {
    expect(withPlayerContext({ type: undefined } as Sentry.ErrorEvent).user).toBeUndefined();
    setClientPlayerContext({ userId: "u1", characterId: "c1", countryId: "CA", staff: false });
    expect(getClientPlayerContext()?.userId).toBe("u1");
    const event = withPlayerContext({ type: undefined, tags: { a: "b" } } as Sentry.ErrorEvent);
    expect(event.user).toEqual({ id: "u1" });
    expect(event.tags).toEqual({
      a: "b",
      "character.id": "c1",
      "country.id": "CA",
      "user.staff": false,
    });
  });
});
