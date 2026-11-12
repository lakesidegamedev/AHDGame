import { describe, expect, it } from "vitest";
import { buildRangeSet, emptyRangeSet } from "./ipRanges";
import { classifyWithRanges } from "./detection";
import { isVpnGateAllowedWritePath, isVpnGated, shouldBlockVpnRequest } from "./gate";

const ranges = {
  vpn: buildRangeSet(["198.51.100.0/24"]),
  privateRelay: buildRangeSet(["172.224.226.0/27", "2a09:bac5:1::/48"]),
};

describe("classifyWithRanges", () => {
  it("flags Cloudflare WARP without any fetched list", () => {
    const none = { vpn: emptyRangeSet(), privateRelay: emptyRangeSet() };
    expect(classifyWithRanges("2a09:bac1:76c0:11f0::e:324", none)).toBe("vpn");
    expect(classifyWithRanges("104.28.5.6", none)).toBe("vpn");
  });

  it("flags listed VPN ranges and leaves home and mobile addresses clear", () => {
    expect(classifyWithRanges("198.51.100.7", ranges)).toBe("vpn");
    expect(classifyWithRanges("199.101.124.193", ranges)).toBe("clear");
    expect(classifyWithRanges("2600:1015:b00f:32a6::1", ranges)).toBe("clear");
  });

  it("exempts Private Relay even when it overlaps a VPN range", () => {
    expect(classifyWithRanges("172.224.226.5", ranges)).toBe("private_relay");
    expect(classifyWithRanges("2a09:bac5:1::9", ranges)).toBe("private_relay");
  });

  it("fails open on unknown or malformed addresses", () => {
    expect(classifyWithRanges("unknown", ranges)).toBe("clear");
    expect(classifyWithRanges("", ranges)).toBe("clear");
  });
});

describe("isVpnGated", () => {
  it("gates ordinary players on a VPN", () => {
    expect(isVpnGated({}, "vpn")).toBe(true);
  });
  it("never gates staff, whitelisted players, or non-VPN connections", () => {
    expect(isVpnGated({ isAdmin: true }, "vpn")).toBe(false);
    expect(isVpnGated({ isModerator: true }, "vpn")).toBe(false);
    expect(isVpnGated({ isJuniorDev: true }, "vpn")).toBe(false);
    expect(isVpnGated({ vpnWhitelisted: true }, "vpn")).toBe(false);
    expect(isVpnGated({}, "private_relay")).toBe(false);
    expect(isVpnGated({}, "clear")).toBe(false);
  });
});

describe("shouldBlockVpnRequest", () => {
  const base = { user: {}, classification: "vpn" as const };

  it("blocks game writes from a gated player", () => {
    expect(shouldBlockVpnRequest({ ...base, method: "POST", pathname: "/api/actions" })).toBe(true);
    expect(
      shouldBlockVpnRequest({ ...base, method: "PATCH", pathname: "/api/corporation/123" })
    ).toBe(true);
  });

  it("allows reads, sign-in, settings and signed-out requests", () => {
    expect(shouldBlockVpnRequest({ ...base, method: "GET", pathname: "/api/actions" })).toBe(false);
    expect(shouldBlockVpnRequest({ ...base, method: "POST", pathname: "/api/auth/login" })).toBe(
      false
    );
    expect(
      shouldBlockVpnRequest({ ...base, method: "PATCH", pathname: "/api/settings/theme" })
    ).toBe(false);
    expect(shouldBlockVpnRequest({ ...base, method: "POST", pathname: "/api/feedback" })).toBe(
      false
    );
    expect(
      shouldBlockVpnRequest({ ...base, user: null, method: "POST", pathname: "/api/actions" })
    ).toBe(false);
  });

  it("does not treat lookalike prefixes as allowed", () => {
    expect(isVpnGateAllowedWritePath("/api/feedback")).toBe(true);
    expect(isVpnGateAllowedWritePath("/api/settingsx")).toBe(false);
    expect(isVpnGateAllowedWritePath("/api/authority")).toBe(false);
    expect(isVpnGateAllowedWritePath("/api/feedbackx")).toBe(false);
    expect(isVpnGateAllowedWritePath("/api/feedback/screenshot")).toBe(true);
  });
});
