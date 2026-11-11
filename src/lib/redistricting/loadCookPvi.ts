import fs from "node:fs";
import path from "node:path";
import { usCongressionalGeometryDirectory } from "@/lib/maps/usCongressionalGeometry";

interface CdFile {
  viewBox: string;
  leanBasis?: string;
  districts: { cd: string; path: string; cookPVI: number }[];
}

/**
 * Load per-district cookPVI for a state, ordered by district code, but only when
 * the file's district count matches the requested apportionment `n`. A mismatch
 * (e.g. a 1991 seat count vs the modern file) returns null so the caller falls
 * back to the deterministic spread. Returns null for missing/unreadable files.
 */
export function loadCookPvi(stateId: string, n: number, preset?: string): (number | null)[] | null {
  const file = path.join(
    process.cwd(),
    "src",
    "data",
    usCongressionalGeometryDirectory(preset),
    `${stateId}.json`
  );
  let parsed: CdFile;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8")) as CdFile;
  } catch {
    return null;
  }
  const districts = parsed.districts ?? [];
  // Geometry carries no observed voting data. Use the modeled fallback instead.
  if (parsed.leanBasis === "unavailable-neutral-rendering-fallback") return null;
  if (districts.length !== n) return null;
  const ordered = [...districts].sort((a, b) => a.cd.localeCompare(b.cd));
  return ordered.map((d) => (typeof d.cookPVI === "number" ? d.cookPVI : null));
}
