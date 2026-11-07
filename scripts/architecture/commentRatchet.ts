import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const LONG_BLOCK_LINES = 12;

const NARRATIVE_MARKERS: readonly RegExp[] = [
  /\b\d{4}-\d{2}-\d{2}\b/,
  /(?<![\w&])#\d{3,}\b/,
  /\bticket\b/i,
  /\bpreviously\b/i,
  /\bused to\b/i,
  /\bowner (?:decided|decision|said|asked)\b/i,
];

export interface FileCounts {
  longBlocks: number;
  narrativeLines: number;
}

export type CommentCounts = Record<string, FileCounts>;

export interface RatchetBaseline {
  note: string;
  files: CommentCounts;
}

export const BASELINE_PATH = join("scripts", "architecture", "commentRatchet.baseline.json");
const SCAN_ROOTS = ["src", "scripts"];
const SCAN_EXT = /\.(?:ts|tsx|mts|mjs|js)$/;

interface CommentBlock {
  lines: string[];
}

/** Extract comment blocks: consecutive `//` lines form one block, a block comment is one block. */
export function extractCommentBlocks(source: string): CommentBlock[] {
  const blocks: CommentBlock[] = [];
  let lineBlock: string[] | null = null;
  let lastLineCommentRow = -2;
  let row = 0;
  let i = 0;
  const n = source.length;
  const closeLineBlock = () => {
    if (lineBlock) blocks.push({ lines: lineBlock });
    lineBlock = null;
  };
  while (i < n) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (ch === "\n") {
      row++;
      i++;
    } else if (ch === "/" && next === "/") {
      let end = source.indexOf("\n", i);
      if (end === -1) end = n;
      if (!lineBlock || lastLineCommentRow !== row - 1) {
        closeLineBlock();
        lineBlock = [];
      }
      lineBlock.push(source.slice(i + 2, end));
      lastLineCommentRow = row;
      i = end;
    } else if (ch === "/" && next === "*") {
      closeLineBlock();
      let end = source.indexOf("*/", i + 2);
      end = end === -1 ? n : end + 2;
      const text = source.slice(i + 2, Math.max(i + 2, end - 2));
      blocks.push({ lines: text.split("\n") });
      row += source.slice(i, end).split("\n").length - 1;
      i = end;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      i++;
      while (i < n && source[i] !== ch) {
        if (source[i] === "\\") i++;
        else if (source[i] === "\n") {
          if (ch !== "`") break;
          row++;
        }
        i++;
      }
      i++;
    } else {
      i++;
    }
  }
  closeLineBlock();
  return blocks;
}

export function countComments(source: string): FileCounts {
  let longBlocks = 0;
  let narrativeLines = 0;
  for (const block of extractCommentBlocks(source)) {
    if (block.lines.length > LONG_BLOCK_LINES) longBlocks++;
    for (const line of block.lines) {
      if (NARRATIVE_MARKERS.some((re) => re.test(line))) narrativeLines++;
    }
  }
  return { longBlocks, narrativeLines };
}

export interface Regression {
  file: string;
  metric: keyof FileCounts;
  baseline: number;
  current: number;
}

/** Any file whose count rose above its baseline (an absent file has baseline 0). */
export function findRegressions(baseline: CommentCounts, current: CommentCounts): Regression[] {
  const out: Regression[] = [];
  for (const [file, counts] of Object.entries(current)) {
    for (const metric of ["longBlocks", "narrativeLines"] as const) {
      const base = baseline[file]?.[metric] ?? 0;
      if (counts[metric] > base)
        out.push({ file, metric, baseline: base, current: counts[metric] });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.metric.localeCompare(b.metric));
}

/** Lower each baseline entry to the current count. Never raises a count or adds a file. */
export function lowerBaseline(baseline: CommentCounts, current: CommentCounts): CommentCounts {
  const out: CommentCounts = {};
  for (const [file, base] of Object.entries(baseline)) {
    const cur = current[file];
    const next: FileCounts = {
      longBlocks: Math.min(base.longBlocks, cur?.longBlocks ?? 0),
      narrativeLines: Math.min(base.narrativeLines, cur?.narrativeLines ?? 0),
    };
    if (next.longBlocks > 0 || next.narrativeLines > 0) out[file] = next;
  }
  return out;
}

export function scanRepo(root = process.cwd()): CommentCounts {
  const listed = execFileSync("git", ["ls-files", "-z", ...SCAN_ROOTS], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  })
    .toString("utf8")
    .split("\0")
    .filter((f) => SCAN_EXT.test(f));
  const out: CommentCounts = {};
  for (const file of listed) {
    let source: string;
    try {
      source = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    if (!source.includes("//") && !source.includes("/*")) continue;
    const counts = countComments(source);
    if (counts.longBlocks > 0 || counts.narrativeLines > 0) out[file] = counts;
  }
  return out;
}

const BASELINE_NOTE =
  "Comment ratchet baseline. Counts may only go down. After cleaning comments run `npm run comment:ratchet:lower`.";

export function readBaseline(root = process.cwd()): RatchetBaseline {
  return JSON.parse(readFileSync(join(root, BASELINE_PATH), "utf8")) as RatchetBaseline;
}

export function writeBaseline(files: CommentCounts, root = process.cwd()): void {
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  const body: RatchetBaseline = { note: BASELINE_NOTE, files: sorted };
  writeFileSync(join(root, BASELINE_PATH), JSON.stringify(body, null, 1) + "\n");
}
