import { parseInfobox } from "@/lib/wiki/rules/embedTags";

export interface GlanceRow {
  label: string;
  value: string;
}

const MAX_ROWS = 9;
const MAX_VALUE_LENGTH = 90;
const MAX_TABLE_BODY_ROWS = 14;

/** Reduce inline markdown to the plain text a narrow rail can show. */
function plainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

const SEPARATOR = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;

function finish(rows: GlanceRow[]): GlanceRow[] | null {
  const kept = rows
    .map((r) => ({ label: plainText(r.label), value: plainText(r.value) }))
    .filter((r) => r.label && r.value && r.value.length <= MAX_VALUE_LENGTH)
    .slice(0, MAX_ROWS);
  return kept.length >= 2 ? kept : null;
}

/**
 * The first label and value table (two columns), or infobox, in a page's
 * markdown. Returns null when the page has neither, so the rail omits the block.
 */
export function extractWikiGlance(content: string): GlanceRow[] | null {
  const lines = content.split("\n");
  let inFence = false;
  let fenceLang = "";
  let fenceBody: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const fence = /^\s*(```|~~~)\s*([\w-]*)/.exec(line);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceLang = fence[2] ?? "";
        fenceBody = [];
      } else {
        inFence = false;
        if (fenceLang === "wiki-infobox") {
          const rows = finish(parseInfobox(fenceBody.join("\n")).rows);
          if (rows) return rows;
        }
      }
      continue;
    }
    if (inFence) {
      fenceBody.push(line);
      continue;
    }

    const tag = /^\{\{\s*infobox\s*:\s*([^}\n]*?)\s*\}\}\s*$/.exec(line);
    if (tag) {
      const [type = "", ...pairs] = (tag[1] ?? "").split("|");
      const body = [`type: ${type}`, ...pairs.map((p) => p.replace("=", ": "))].join("\n");
      const rows = finish(parseInfobox(body).rows);
      if (rows) return rows;
      continue;
    }

    if (!line.trim().startsWith("|") || !SEPARATOR.test((lines[i + 1] ?? "").trim())) continue;
    const header = splitRow(line);
    const body: string[][] = [];
    let j = i + 2;
    while (j < lines.length && (lines[j] ?? "").trim().startsWith("|")) {
      body.push(splitRow(lines[j] ?? ""));
      j++;
    }
    i = j - 1;
    if (header.length !== 2 || body.length > MAX_TABLE_BODY_ROWS) continue;
    const rows = finish(body.map((cells) => ({ label: cells[0] ?? "", value: cells[1] ?? "" })));
    if (rows) return rows;
  }
  return null;
}
