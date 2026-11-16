/**
 * Short writer tags for wiki pages, expanded into the fenced widget blocks the
 * renderer already understands:
 *
 *   {{infobox:politician|Name=Ada Lane|Party=Civic Union}}
 *   {{election:665f1c2e9a3b4c0012ab34cd}}
 *   {{party-seats:us-3}}
 *   {{stock:152}}
 */

export const INFOBOX_TYPES = ["politician", "party", "corporation"] as const;
export type InfoboxType = (typeof INFOBOX_TYPES)[number];

const TAG_LINE = /^\{\{\s*([a-z-]+)\s*:\s*([^}\n]*?)\s*\}\}\s*$/;

const FENCE_BY_KIND: Record<string, string> = {
  infobox: "wiki-infobox",
  election: "wiki-election",
  "party-seats": "wiki-party-seats",
  stock: "wiki-stock",
};

/** Plain text only: strip the characters that could close the fence or inject markup. */
function cleanValue(value: string): string {
  return value
    .replace(/[`\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export function expandWikiTags(content: string): string {
  if (!content.includes("{{")) return content;
  let inFence = false;
  return content
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      if (inFence) return line;
      const match = TAG_LINE.exec(line);
      const kind = match?.[1];
      if (!match || !kind || !(kind in FENCE_BY_KIND)) return line;
      const fence = FENCE_BY_KIND[kind];
      const body = match[2] ?? "";
      if (kind === "infobox") {
        const [type = "", ...pairs] = body.split("|");
        const rows = pairs
          .map((pair) => {
            const eq = pair.indexOf("=");
            if (eq < 1) return null;
            return `${cleanValue(pair.slice(0, eq))}: ${cleanValue(pair.slice(eq + 1))}`;
          })
          .filter((row): row is string => row !== null);
        return ["```" + fence, `type: ${cleanValue(type)}`, ...rows, "```"].join("\n");
      }
      return ["```" + fence, cleanValue(body), "```"].join("\n");
    })
    .join("\n");
}

export interface Infobox {
  type: InfoboxType | null;
  rows: { label: string; value: string }[];
}

export function parseInfobox(data: string): Infobox {
  const lines = data.split("\n").map((l) => l.trim());
  let type: InfoboxType | null = null;
  const rows: Infobox["rows"] = [];
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const label = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (label.toLowerCase() === "type") {
      type = (INFOBOX_TYPES as readonly string[]).includes(value.toLowerCase())
        ? (value.toLowerCase() as InfoboxType)
        : null;
    } else if (value) {
      rows.push({ label, value });
    }
  }
  return { type, rows };
}

const OBJECT_ID = /^[a-f0-9]{24}$/;
const PARTY_ID = /^([a-z]{2})-(\d{1,6})$/;
const SEQUENTIAL_ID = /^\d{1,9}$/;

export function isElectionId(id: string): boolean {
  return OBJECT_ID.test(id);
}

export function parsePartySeatsId(id: string): { countryId: string; sequentialId: number } | null {
  const m = PARTY_ID.exec(id);
  return m ? { countryId: m[1]!.toUpperCase(), sequentialId: Number(m[2]) } : null;
}

export function isSequentialId(id: string): boolean {
  return SEQUENTIAL_ID.test(id);
}
