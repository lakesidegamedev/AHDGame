import type { EditorStateConfig, DerivedComposition, EraId } from "./types";

export function stateConfigToCsv(cfg: EditorStateConfig, derived: DerivedComposition): string {
  const lines: string[] = [];
  lines.push("section,era,country,state,a,b,c,d,e,f");
  for (const dim of cfg.dims) {
    for (const [key, e] of Object.entries(cfg.layer1[dim])) {
      lines.push(
        `layer1,${cfg.era},${cfg.countryId},${cfg.stateId},${dim},${key},${e.share},${e.turnout},${e.economicLean},${e.socialLean}`
      );
    }
  }
  for (const section of derived.buckets) {
    for (const b of section.buckets) {
      lines.push(
        `derived,${cfg.era},${cfg.countryId},${cfg.stateId},${section.dim},${b.id},${b.sharePct.toFixed(2)},${b.economicLean.toFixed(2)},${b.socialLean.toFixed(2)},${b.turnout.toFixed(1)}`
      );
    }
  }
  lines.push(
    `state,${cfg.era},${cfg.countryId},${cfg.stateId},${derived.stateEconomicLean},${derived.stateSocialLean},${derived.stateDisplayLean},,,`
  );
  return lines.join("\n");
}

export function allStatesLeanToCsv(
  era: EraId,
  country: string,
  rows: Array<{ stateId: string; economic: number; social: number; display: number }>
): string {
  const lines = ["era,country,state,economic,social,display"];
  for (const r of rows)
    lines.push(`${era},${country},${r.stateId},${r.economic},${r.social},${r.display}`);
  return lines.join("\n");
}

/** Full-country CSV export — every state's Layer-1, census buckets, and lean.
 *  Includes localStorage edits (overrides) when passed as `configs`. */
export function allStatesFullToCsv(
  era: EraId,
  country: string,
  states: Array<{ stateId: string; config: EditorStateConfig; derived: DerivedComposition }>
): string {
  const lines: string[] = [];
  lines.push("section,era,country,state,a,b,c,d,e,f,g,h");

  for (const { stateId, config, derived } of states) {
    // Layer-1 rows
    for (const dim of config.dims) {
      for (const [key, e] of Object.entries(config.layer1[dim])) {
        lines.push(
          `layer1,${era},${country},${stateId},${dim},${key},${e.share},${e.turnout},${e.economicLean},${e.socialLean},,`
        );
      }
    }
    // Derived census bucket rows
    for (const section of derived.buckets) {
      for (const b of section.buckets) {
        lines.push(
          `derived,${era},${country},${stateId},${section.dim},${b.id},${b.sharePct.toFixed(2)},${b.economicLean.toFixed(2)},${b.socialLean.toFixed(2)},${b.turnout.toFixed(1)},,`
        );
      }
    }
    // State lean row
    lines.push(
      `state,${era},${country},${stateId},${derived.stateEconomicLean},${derived.stateSocialLean},${derived.stateDisplayLean},,,,,`
    );
  }

  return lines.join("\n");
}

/** Browser download helper. */
export function downloadCsv(filename: string, content: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
