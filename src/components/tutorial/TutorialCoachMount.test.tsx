// @vitest-environment happy-dom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ mode: null as string | null }));
vi.mock("next/dynamic", () => ({
  // Resolve the lazy surfaces to markers so the test sees which one mounts.
  default: (loader: () => Promise<unknown>) => {
    const source = String(loader);
    const name = source.includes("TutorialWelcome") ? "welcome" : "coach";
    return () => <div data-testid={name} />;
  },
}));
vi.mock("@/contexts/AuthDataContext", () => ({
  useSignedIn: () => true,
  useOptionalAuthMe: () => ({ navData: { user: { singleplayerMode: auth.mode } } }),
}));
import { reportSingleplayerGuideOffered } from "@/lib/singleplayerGuideClient";
import { TutorialCoachMount } from "./TutorialCoachMount";

const character = {
  name: "Test",
  countryId: "US",
  homeState: "OH",
  createdAt: new Date().toISOString(),
};

async function mount() {
  const view = render(<TutorialCoachMount />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return view;
}

beforeEach(() => {
  auth.mode = null;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ character }) })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TutorialCoachMount in a local world", () => {
  it("asks a new multiplayer-style character which tour they want", async () => {
    const view = await mount();
    expect(view.queryByTestId("welcome")).not.toBeNull();
  });

  it("stays quiet in a normal-mode local world that offers the guide, open or closed", async () => {
    auth.mode = "normal";
    reportSingleplayerGuideOffered(true);
    const view = await mount();
    expect(view.queryByTestId("welcome")).toBeNull();
    expect(view.queryByTestId("coach")).toBeNull();
  });

  it("behaves as before in a local world that does not offer the guide", async () => {
    auth.mode = "normal";
    reportSingleplayerGuideOffered(false);
    const view = await mount();
    expect(view.queryByTestId("welcome")).not.toBeNull();
  });

  it("is untouched in the other local modes", async () => {
    auth.mode = "head-of-state";
    reportSingleplayerGuideOffered(true);
    const view = await mount();
    expect(view.queryByTestId("welcome")).not.toBeNull();
  });
});
