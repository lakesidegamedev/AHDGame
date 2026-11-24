import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  user: null as Record<string, unknown> | null,
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (mocks.cookie === undefined ? undefined : { value: mocks.cookie }),
  }),
}));
vi.mock("@/lib/auth", () => ({ getAuthUser: async () => mocks.user }));

import { isExperimentalUiEnabled } from "./experimentalUi";

beforeEach(() => {
  mocks.cookie = undefined;
  mocks.user = null;
});

// The ASCII page decode stays opt-in even though the navigation layouts are now
// for everyone: a saved layout must never switch it on.
describe("isExperimentalUiEnabled", () => {
  it("stays off for a player who has not opted in, whatever layout they saved", async () => {
    mocks.user = {
      experimentalFeatures: false,
      desktopNavigationLayout: "cards",
      mobileNavigationLayout: "dock",
    };
    expect(await isExperimentalUiEnabled()).toBe(false);
    mocks.user = { desktopNavigationLayout: "standard" };
    expect(await isExperimentalUiEnabled()).toBe(false);
  });

  it("stays off for signed-out visitors", async () => {
    expect(await isExperimentalUiEnabled()).toBe(false);
  });

  it("turns on with the opt-in cookie or the account opt-in", async () => {
    mocks.cookie = "1";
    expect(await isExperimentalUiEnabled()).toBe(true);
    mocks.cookie = undefined;
    mocks.user = { experimentalFeatures: true };
    expect(await isExperimentalUiEnabled()).toBe(true);
  });
});
