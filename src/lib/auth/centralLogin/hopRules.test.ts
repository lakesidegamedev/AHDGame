import { describe, expect, it } from "vitest";
import { buildHopAuthorizeUrl, judgeHopCallback, safeHopDestination } from "./hopRules";

const now = new Date("2030-01-01T00:00:00Z");
const flow = { state: "s1", nonce: "n1", userId: "u1", expiresAt: new Date(now.getTime() + 1000) };
const good = {
  flow,
  queryState: "s1",
  providerError: false,
  claims: { nonce: "n1", ahd_user_id: "u1" },
  sessionUserId: "u1",
  now,
};

describe("judgeHopCallback", () => {
  it("accepts a fully matching callback", () => {
    expect(judgeHopCallback(good)).toEqual({ ok: true });
  });
  it.each([
    ["no flow", { flow: null }, "hop_no_flow"],
    ["expired flow", { flow: { ...flow, expiresAt: now } }, "hop_no_flow"],
    ["provider error", { providerError: true }, "hop_provider_error"],
    ["state mismatch", { queryState: "other" }, "hop_state"],
    ["missing state", { queryState: null }, "hop_state"],
    ["no claims", { claims: null }, "hop_exchange"],
    ["nonce mismatch", { claims: { nonce: "x", ahd_user_id: "u1" } }, "hop_nonce"],
    ["no session", { sessionUserId: null }, "hop_no_session"],
    ["wrong account", { claims: { nonce: "n1", ahd_user_id: "u2" } }, "hop_user_mismatch"],
    ["missing account claim", { claims: { nonce: "n1" } }, "hop_user_mismatch"],
    [
      "session differs from flow",
      { sessionUserId: "u2", claims: { nonce: "n1", ahd_user_id: "u2" } },
      "hop_user_mismatch",
    ],
  ])("rejects: %s", (_name, patch, reason) => {
    expect(judgeHopCallback({ ...good, ...patch })).toEqual({ ok: false, reason });
  });
});

describe("hop url and destination", () => {
  it("builds a PKCE authorization url carrying the ticket", () => {
    const url = new URL(
      buildHopAuthorizeUrl({
        issuer: "https://issuer.example.invalid/realms/r/",
        clientId: "ahd-web",
        redirectUri: "https://app.example.invalid/api/auth/lakeside-hop/callback",
        state: "s",
        nonce: "n",
        codeChallenge: "c",
        ticket: "tk",
      })
    );
    expect(url.pathname).toBe("/realms/r/protocol/openid-connect/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "ahd-web",
      scope: "openid",
      response_type: "code",
      code_challenge_method: "S256",
      lakeside_ticket: "tk",
      state: "s",
      nonce: "n",
    });
  });
  it("keeps only safe destinations", () => {
    const never = () => false;
    const origin = "https://app.example.invalid";
    expect(safeHopDestination("/profile", origin, never)).toBe("/profile");
    expect(safeHopDestination("//evil.example.invalid", origin, never)).toBe("/");
    expect(safeHopDestination("https://evil.example.invalid/x", origin, never)).toBe("/");
    expect(safeHopDestination(`${origin}/result?a=1`, origin, never)).toBe("/result?a=1");
    expect(safeHopDestination("https://other.example.invalid/x", origin, () => true)).toBe(
      "https://other.example.invalid/x"
    );
    expect(safeHopDestination(null, origin, never)).toBe("/");
  });
});
