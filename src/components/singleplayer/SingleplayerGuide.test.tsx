// @vitest-environment happy-dom
import React from "react";
import { NextIntlClientProvider } from "next-intl";
import enNav from "../../../messages/en/nav.json";
import { act, cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SingleplayerGuide as GuideState } from "@/lib/singleplayerGuide";

const state = vi.hoisted(() => ({ mode: "normal" as string | null, pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/contexts/AuthDataContext", () => ({
  useAuthMe: () => ({ navData: { user: { singleplayerMode: state.mode } } }),
}));
import { SingleplayerGuide } from "./SingleplayerGuide";

const STEP_IDS = ["character", "campaign", "party", "end-turn", "inbox"] as const;
const HREFS: Record<(typeof STEP_IDS)[number], string> = {
  character: "/create-character",
  campaign: "/actions",
  party: "/country/us/parties",
  "end-turn": "/",
  inbox: "/notifications",
};

function guide(done: string[], extra: Partial<GuideState> = {}): GuideState {
  return {
    offered: true,
    active: true,
    funds: 75_000,
    actions: 4,
    steps: STEP_IDS.map((id) => ({ id, done: done.includes(id), href: HREFS[id] })),
    ...extra,
  };
}

let serverGuide: GuideState;
const fetchMock = vi.fn();

function render() {
  return rtlRender(<SingleplayerGuide />, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale="en" messages={enNav}>
        {children}
      </NextIntlClientProvider>
    ),
  });
}

const settle = () => act(async () => void (await Promise.resolve()));

beforeEach(() => {
  state.mode = "normal";
  state.pathname = "/";
  serverGuide = guide([]);
  fetchMock.mockReset().mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const { action } = JSON.parse(String(init.body)) as { action: string };
      if (action === "dismiss")
        serverGuide = { offered: true, active: false, steps: [], funds: null, actions: null };
      if (action === "inbox-opened") {
        serverGuide = guide(
          serverGuide.steps
            .filter((s) => s.done)
            .map((s) => s.id)
            .concat("inbox")
        );
      }
    }
    return { ok: true, json: async () => serverGuide };
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SingleplayerGuide", () => {
  it("renders nothing and asks for nothing outside a normal-mode local world", async () => {
    state.mode = "head-of-state";
    const { container } = render();
    await settle();
    expect(container.innerHTML).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders nothing when the world does not offer the guide", async () => {
    serverGuide = { offered: false, active: false, steps: [], funds: null, actions: null };
    const { container } = render();
    await settle();
    expect(container.innerHTML).toBe("");
  });

  it("starts by asking for a character, with the way to create one", async () => {
    render();
    await settle();
    expect(screen.getByText("0 of 5 done")).toBeTruthy();
    expect(screen.getByText(/Pick a country and where you live/)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Create character" });
    expect(link.getAttribute("href")).toBe("/create-character");
  });

  it("shows no create link while the player is already on the creation page", async () => {
    state.pathname = "/create-character";
    render();
    await settle();
    expect(screen.queryByRole("link", { name: "Create character" })).toBeNull();
    expect(screen.getByText(/Pick a country/)).toBeTruthy();
  });

  it("explains funds and actions with the player's real numbers on the campaign step", async () => {
    serverGuide = guide(["character"]);
    render();
    await settle();
    expect(screen.getByText("1 of 5 done")).toBeTruthy();
    expect(screen.getByText(/You have ₳75,000 and 4 actions\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Actions" }).getAttribute("href")).toBe(
      "/actions"
    );
  });

  it("tells the player to use End turn without offering a link of its own", async () => {
    serverGuide = guide(["character", "campaign", "party"]);
    render();
    await settle();
    expect(screen.getByText(/Use the End turn button/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /overview/i })).toBeNull();
  });

  it("marks finished steps and moves to the next one as the server reports progress", async () => {
    vi.useFakeTimers();
    render();
    await settle();
    expect(screen.getByText("0 of 5 done")).toBeTruthy();
    serverGuide = guide(["character", "campaign"]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_100);
    });
    expect(screen.getByText("2 of 5 done")).toBeTruthy();
    expect(screen.getByText(/A party gives you a shared pool/)).toBeTruthy();
  });

  it("refreshes straight away when a turn finishes", async () => {
    render();
    await settle();
    const before = fetchMock.mock.calls.length;
    serverGuide = guide(["character", "campaign", "party", "end-turn"]);
    await act(async () => {
      window.dispatchEvent(new Event("ahd:turn-complete"));
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
    expect(screen.getByText("4 of 5 done")).toBeTruthy();
    expect(screen.getByText(/Results, offers and messages/)).toBeTruthy();
  });

  it("records the inbox visit once when the player opens the inbox", async () => {
    serverGuide = guide(["character", "campaign", "party", "end-turn"]);
    state.pathname = "/notifications";
    render();
    await settle();
    await settle();
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0][1].body))).toEqual({ action: "inbox-opened" });
    expect(screen.getByText("5 of 5 done")).toBeTruthy();
    expect(screen.getByText(/That covers the basics/)).toBeTruthy();
  });

  it("does not record an inbox visit elsewhere", async () => {
    serverGuide = guide(["character", "campaign", "party", "end-turn"]);
    state.pathname = "/actions";
    render();
    await settle();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("folds away and back without losing progress", async () => {
    serverGuide = guide(["character"]);
    render();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Hide guide" }));
    expect(screen.queryByText(/You have ₳75,000/)).toBeNull();
    expect(screen.getByText("1 of 5 done")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show guide" }));
    expect(screen.getByText(/You have ₳75,000/)).toBeTruthy();
  });

  it("skipping stores the dismissal and removes the guide", async () => {
    const { container } = render();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Skip guide" }));
    await settle();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1].body))).toEqual({ action: "dismiss" });
    expect(container.innerHTML).toBe("");
  });

  it("offers Close rather than Skip once everything is done", async () => {
    serverGuide = guide([...STEP_IDS]);
    render();
    await settle();
    expect(screen.getByRole("button", { name: "Close guide" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Skip guide" })).toBeNull();
  });
});
