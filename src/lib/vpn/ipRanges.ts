/**
 * Pure CIDR range matching for the VPN gate. Ranges are flattened to sorted,
 * merged [start, end] bigint pairs per address family so a lookup is one
 * binary search, cheap enough to run on every write request.
 */

export interface IpRangeSet {
  v4: Array<[bigint, bigint]>;
  v6: Array<[bigint, bigint]>;
}

export function emptyRangeSet(): IpRangeSet {
  return { v4: [], v6: [] };
}

function parseIpv4(ip: string): bigint | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = BigInt(0);
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = (value << BigInt(8)) | BigInt(n);
  }
  return value;
}

function parseIpv6(ip: string): bigint | null {
  let addr = ip.toLowerCase();
  const zone = addr.indexOf("%");
  if (zone !== -1) addr = addr.slice(0, zone);
  // Embedded IPv4 tail (e.g. ::ffff:1.2.3.4).
  const lastColon = addr.lastIndexOf(":");
  if (lastColon !== -1 && addr.slice(lastColon + 1).includes(".")) {
    const v4 = parseIpv4(addr.slice(lastColon + 1));
    if (v4 === null) return null;
    const hi = Number(v4 >> BigInt(16)).toString(16);
    const lo = Number(v4 & BigInt(0xffff)).toString(16);
    addr = `${addr.slice(0, lastColon + 1)}${hi}:${lo}`;
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  let value = BigInt(0);
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    value = (value << BigInt(16)) | BigInt(parseInt(g, 16));
  }
  return value;
}

/** Parse an address into its family and numeric value, or null if malformed. */
export function parseIp(ip: string): { family: 4 | 6; value: bigint } | null {
  const trimmed = ip.trim();
  if (!trimmed) return null;
  if (trimmed.includes(":")) {
    const value = parseIpv6(trimmed);
    if (value === null) return null;
    // IPv4-mapped IPv6 (::ffff:a.b.c.d) is matched against the IPv4 table.
    if (value >> BigInt(32) === BigInt(0xffff)) {
      return { family: 4, value: value & BigInt(0xffffffff) };
    }
    return { family: 6, value };
  }
  const value = parseIpv4(trimmed);
  return value === null ? null : { family: 4, value };
}

/** Parse "a.b.c.d/n", "x::/n" or a bare address into an inclusive range. */
export function parseCidr(cidr: string): { family: 4 | 6; start: bigint; end: bigint } | null {
  const [addr, prefixRaw, extra] = cidr.trim().split("/");
  if (extra !== undefined || !addr) return null;
  const parsed = parseIp(addr);
  if (!parsed) return null;
  // An IPv4-mapped IPv6 address is only accepted as a bare host; its prefix
  // would be in IPv6 width, which the IPv4 table cannot represent.
  if (addr.includes(":") && parsed.family === 4 && prefixRaw !== undefined) return null;
  const bits = parsed.family === 4 ? 32 : 128;
  const prefix = prefixRaw === undefined ? bits : Number(prefixRaw);
  if (!/^\d+$/.test(prefixRaw ?? "0") || prefix > bits) return null;
  const hostBits = BigInt(bits - prefix);
  const mask = (BigInt(1) << hostBits) - BigInt(1);
  const start = parsed.value & ~mask;
  return { family: parsed.family, start, end: start | mask };
}

function merge(ranges: Array<[bigint, bigint]>): Array<[bigint, bigint]> {
  ranges.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const out: Array<[bigint, bigint]> = [];
  for (const r of ranges) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + BigInt(1)) {
      if (r[1] > last[1]) last[1] = r[1];
    } else {
      out.push([r[0], r[1]]);
    }
  }
  return out;
}

/** Build a lookup set from CIDR strings. Malformed entries are skipped. */
export function buildRangeSet(cidrs: Iterable<string>): IpRangeSet {
  const v4: Array<[bigint, bigint]> = [];
  const v6: Array<[bigint, bigint]> = [];
  for (const cidr of cidrs) {
    const r = parseCidr(cidr);
    if (!r) continue;
    (r.family === 4 ? v4 : v6).push([r.start, r.end]);
  }
  return { v4: merge(v4), v6: merge(v6) };
}

export function rangeSetSize(set: IpRangeSet): number {
  return set.v4.length + set.v6.length;
}

/** True when the address falls inside any range in the set. */
export function rangeSetHas(set: IpRangeSet, ip: string): boolean {
  const parsed = parseIp(ip);
  if (!parsed) return false;
  const table = parsed.family === 4 ? set.v4 : set.v6;
  let lo = 0;
  let hi = table.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = table[mid];
    if (parsed.value < start) hi = mid - 1;
    else if (parsed.value > end) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * Extract CIDRs from a published list. Accepts one entry per line, optionally
 * followed by comma-separated columns (Apple's Private Relay CSV) or a comment.
 */
export function parseCidrList(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const entry = line.split("#")[0].split(",")[0].trim();
    if (entry && parseCidr(entry)) out.push(entry);
  }
  return out;
}
