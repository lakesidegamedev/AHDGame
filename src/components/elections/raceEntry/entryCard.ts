import { buildWithdrawalConfirmMessage } from "@/lib/elections/withdrawalWarning";
import {
  FILING_COST_LINES,
  closedFilingLine,
  fieldLine,
  scheduleLines,
  type EntryCheck,
  type EntryScheduleInput,
  type FieldCandidate,
} from "@/lib/elections/entryPreview";

export { closedFilingLine };

/** Body lines of a withdrawal warning, without its leading question. */
function withdrawalTerms(phase: "primary" | "general"): string {
  return buildWithdrawalConfirmMessage(phase).split("\n").slice(2).join(" ").trim();
}

const MARK = { pass: "Yes", fail: "No", later: "Later" } as const;

export interface EntryCardInput {
  /** `null` when the preview could not be loaded. */
  checks: EntryCheck[] | null;
  schedule: EntryScheduleInput;
  candidates: FieldCandidate[] | null;
  incumbent: { name: string; party: string } | null;
}

/** Plain-text pre-commit card shown in the confirm dialog before filing. */
export function buildEntryCardMessage(card: EntryCardInput): string {
  const sections: string[][] = [];
  sections.push(["Cost", ...FILING_COST_LINES]);
  sections.push([
    "Eligibility",
    ...(card.checks
      ? card.checks.map(
          (c) =>
            `${MARK[c.status]}: ${c.label}${c.status === "fail" && c.reason ? `. ${c.reason}` : ""}`
        )
      : ["Eligibility is checked when you file."]),
  ]);
  const field = fieldLine(card.candidates, card.incumbent);
  if (field.length > 0) sections.push(["Field", ...field]);
  const schedule = scheduleLines(card.schedule);
  if (schedule.length > 0) sections.push(["Schedule", ...schedule]);
  sections.push([
    "If you withdraw",
    `In the primary: ${withdrawalTerms("primary")}`,
    `In the general: ${withdrawalTerms("general")}`,
  ]);
  return sections.map((lines) => lines.join("\n")).join("\n\n");
}
