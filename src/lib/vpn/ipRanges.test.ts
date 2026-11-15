import { describe, expect, it } from "vitest";
import { buildRangeSet, parseCidr, parseCidrList, parseIp, rangeSetHas } from "./ipRanges";

describe("parseIp", () => {
  it("parses IPv4 and IPv6 and rejects junk", () => {
    expect(parseIp("1.2.3.4")?.family).toBe(4);
    expect(parseIp("2a09:bac5:7e0c:1cd2::2df:da")?.family).toBe(6);
    expect(parseIp("::ffff:1.2.3.4")).toEqual(parseIp("1.2.3.4"));
    expect(parseIp("256.1.1.1")).toBeNull();
    expect(parseIp("1:2:3")).toBeNull();
    expect(parseIp("unknown")).toBeNull();
    expect(parseIp("")).toBeNull();
  });
});

describe("parseCidr", () => {
  it("masks host bits and rejects bad prefixes", () => {
    const r = parseCidr("10.1.2.3/8");
    expect(r?.start).toBe(parseIp("10.0.0.0")?.value);
    expect(r?.end).toBe(parseIp("10.255.255.255")?.value);
    expect(parseCidr("10.0.0.0/33")).toBeNull();
    expect(parseCidr("10.0.0.0/-1")).toBeNull();
    expect(parseCidr("2a09:bac0::/29")?.family).toBe(6);
  });
});

describe("rangeSetHas", () => {
  const set = buildRangeSet([
    "104.28.0.0/16",
    "2a09:bac0::/29",
    "10.0.0.0/8",
    "10.0.0.0/16",
    "bogus",
  ]);

  it("matches IPv4 and IPv6 members", () => {
    expect(rangeSetHas(set, "104.28.12.34")).toBe(true);
    expect(rangeSetHas(set, "2a09:bac5:7e0c:1cd2::2df:da")).toBe(true);
    expect(rangeSetHas(set, "10.200.1.1")).toBe(true);
  });

  it("does not match outsiders or malformed input", () => {
    expect(rangeSetHas(set, "104.29.0.1")).toBe(false);
    expect(rangeSetHas(set, "2a09:bac8::1")).toBe(false);
    expect(rangeSetHas(set, "2600:1015:b00f:32a6::1")).toBe(false);
    expect(rangeSetHas(set, "not-an-ip")).toBe(false);
  });

  it("merges overlapping ranges", () => {
    expect(set.v4).toHaveLength(2);
  });
});

describe("parseCidrList", () => {
  it("reads plain lists, comments and the Private Relay CSV shape", () => {
    const text = "# header\n1.2.3.0/24\n172.224.226.0/27,GB,GB-EN,London,\n\nnope\n";
    expect(parseCidrList(text)).toEqual(["1.2.3.0/24", "172.224.226.0/27"]);
  });
});
