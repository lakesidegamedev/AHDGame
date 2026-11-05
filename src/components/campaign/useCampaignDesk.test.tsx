/** @vitest-environment happy-dom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCampaignDesk } from "./useCampaignDesk";

type Routes = Record<string, { ok?: boolean; body: unknown }>;

function stubFetch(routes: Routes) {
  const fn = vi.fn(async (url: string) => {
    const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
    if (!hit) return { ok: false, json: async () => ({}) };
    return { ok: hit[1].ok ?? true, json: async () => hit[1].body };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const campaign = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  electionId: "e1",
  accessLevel: "owner",
  isRunningMate: false,
  isArchived: false,
  campaignSuspended: false,
  electionInfo: { isEnded: false },
  ...over,
});

const hub = { electionId: "e1", positives: { camp: { states: [] } } };
const me = { user: { character: { id: "char1", actions: 12, funds: 500, countryId: "US" } } };

function routes(c: Record<string, unknown>): Routes {
  return {
    "/api/campaigns/c1": { body: { campaign: c } },
    "/api/auth/me": { body: me },
    "/api/game/turn/status": { body: { currentTurn: 7 } },
    "/api/elections/e1/wire": { body: { items: [{ headline: "Polls move" }] } },
    "/api/elections/e1/state-operations": { body: hub },
    "/api/canvassing/eligibility": { body: { ok: true, stateId: "OH", source: "home" } },
  };
}

beforeEach(() => vi.unstubAllGlobals());

describe("useCampaignDesk", () => {
  it("loads nothing without a campaign", () => {
    const fn = stubFetch({});
    const { result } = renderHook(() => useCampaignDesk(null));
    expect(result.current.loading).toBe(false);
    expect(result.current.campaign).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it("gives a manager the full surface, the hub and the canvass state", async () => {
    stubFetch(routes(campaign()));
    const { result } = renderHook(() => useCampaignDesk("c1"));
    await waitFor(() => expect(result.current.canvassStateId).toBe("OH"));
    expect(result.current.canManage).toBe(true);
    expect(result.current.canSurrogate).toBe(false);
    expect(result.current.stateOps.view?.electionId).toBe("e1");
    expect(result.current.me.characterId).toBe("char1");
    expect(result.current.currentTurn).toBe(7);
    expect(result.current.wire).toEqual(["Polls move"]);
  });

  it("gives a running mate the surrogate surface only", async () => {
    stubFetch(routes(campaign({ isRunningMate: true })));
    const { result } = renderHook(() => useCampaignDesk("c1"));
    await waitFor(() => expect(result.current.campaign).not.toBeNull());
    expect(result.current.canManage).toBe(false);
    expect(result.current.canSurrogate).toBe(true);
    expect(result.current.canvassStateId).toBeNull();
  });

  it("closes every control on an archived campaign", async () => {
    stubFetch(routes(campaign({ isArchived: true })));
    const { result } = renderHook(() => useCampaignDesk("c1"));
    await waitFor(() => expect(result.current.campaign).not.toBeNull());
    expect(result.current.canManage).toBe(false);
    expect(result.current.canSurrogate).toBe(false);
  });

  it("does not ask a rival's viewer for the candidate's hub or canvass state", async () => {
    const fn = stubFetch(routes(campaign({ accessLevel: "public" })));
    const { result } = renderHook(() => useCampaignDesk("c1"));
    await waitFor(() => expect(result.current.campaign).not.toBeNull());
    expect(result.current.canManage).toBe(false);
    expect(fn.mock.calls.some(([u]) => String(u).includes("state-operations"))).toBe(false);
    expect(fn.mock.calls.some(([u]) => String(u).includes("canvassing"))).toBe(false);
  });

  it("reports a failed load", async () => {
    stubFetch({ "/api/campaigns/c1": { ok: false, body: { error: "nope" } } });
    const { result } = renderHook(() => useCampaignDesk("c1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.campaign).toBeNull();
    expect(result.current.error).not.toBe("");
  });
});
