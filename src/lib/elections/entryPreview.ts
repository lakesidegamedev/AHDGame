/**
 * Rules for the "enter this race" pre-commit card. The enter route and the
 * preview route both call these, so the card and the server cannot disagree.
 * Plain data in, plain data out.
 */

export interface HeldOfficeLike {
  type?: string;
  state?: string;
  senateClass?: unknown;
}

export interface EntryRaceFacts {
  electionType: string;
  state: string | undefined;
  senateClass?: number | null;
}

/** Players run in their own region, except nationwide executive races and the Duma national list. */
export function homeStateBlocks(args: {
  isNationwideExecutive: boolean;
  nationalList: boolean;
  electionState: string | undefined;
  homeState: string | undefined;
}): boolean {
  return (
    !args.isNationwideExecutive &&
    !args.nationalList &&
    Boolean(args.electionState) &&
    args.homeState !== args.electionState
  );
}

/** A seated Senator may only seek re-election to their own class. Returns the held class when it blocks. */
export function senateClassBlock(
  heldOffice: HeldOfficeLike | null | undefined,
  race: EntryRaceFacts
): number | null {
  if (race.electionType !== "senate") return null;
  if (!heldOffice || heldOffice.type !== "senate") return null;
  const held = heldOffice.senateClass;
  if (held == null || held === race.senateClass) return null;
  return held as number;
}

/** A sitting Commons member already holds a seat that is not on a by-election ballot. */
export function holdsCommonsSeatInRace(
  heldOffice: HeldOfficeLike | null | undefined,
  race: { officeKey: string; isSpecialCommons: boolean; state: string | undefined }
): boolean {
  return (
    race.isSpecialCommons &&
    heldOffice?.type === race.officeKey &&
    heldOffice.state !== undefined &&
    heldOffice.state === race.state
  );
}

export type EntryCheckStatus = "pass" | "fail" | "later";

export interface EntryCheck {
  id: string;
  label: string;
  status: EntryCheckStatus;
  /** Why a failed check fails, or what a deferred check waits on. */
  reason?: string;
}

export interface EntryChecksInput {
  open: boolean;
  primaryEnded: boolean;
  raceCountry: string;
  characterCountry: string;
  homeStateBlocked: boolean;
  homeState: string;
  raceState: string;
  homeStateDeferred: boolean;
  termLimitReached: boolean;
  senateClassHeld: number | null;
  raceSenateClass: number | null | undefined;
  holdsCommonsSeat: boolean;
  alreadyEntered: boolean;
  withdrew: boolean;
  otherRace: string | null;
  /** Rules only the filing route can judge (one-party state, country-specific filing). */
  deferredRules: string[];
}

function check(id: string, label: string, failReason: string | null): EntryCheck {
  return failReason === null
    ? { id, label, status: "pass" }
    : { id, label, status: "fail", reason: failReason };
}

export function evaluateEntryChecks(i: EntryChecksInput): EntryCheck[] {
  const out: EntryCheck[] = [];
  out.push(
    check(
      "filingOpen",
      "Filing is open",
      !i.open
        ? "This race is not open for entry."
        : i.primaryEnded
          ? "The primary entry period has ended."
          : null
    )
  );
  out.push(
    check(
      "country",
      "Character is from this country",
      i.raceCountry !== i.characterCountry
        ? `This race is for ${i.raceCountry} characters only.`
        : null
    )
  );
  out.push(
    i.homeStateDeferred
      ? {
          id: "homeState",
          label: "Lives in this region",
          status: "later",
          reason: "Residence is checked when you file.",
        }
      : check(
          "homeState",
          "Lives in this region",
          i.homeStateBlocked
            ? `You can only run in your home state (${i.homeState}). This race is in ${i.raceState}.`
            : null
        )
  );
  out.push(
    check(
      "termLimit",
      "Within term limits",
      i.termLimitReached ? "This character has already served the maximum number of terms." : null
    )
  );
  if (i.senateClassHeld !== null) {
    out.push(
      check(
        "senateClass",
        "Seeking your own Senate seat",
        `You hold the Class ${i.senateClassHeld} seat and may only run for re-election to it, not Class ${i.raceSenateClass}.`
      )
    );
  }
  if (i.holdsCommonsSeat) {
    out.push(
      check(
        "commonsSeat",
        "Not already seated here",
        "You already hold a Commons seat in this region. Resign it first to stand as a challenger."
      )
    );
  }
  out.push(
    check(
      "notEntered",
      "Not already entered",
      i.alreadyEntered ? "You are already entered in this race." : null
    )
  );
  out.push(
    check(
      "notWithdrew",
      "Has not withdrawn from this race",
      i.withdrew ? "You withdrew from this race and cannot re-enter it." : null
    )
  );
  out.push(
    check(
      "noOtherRace",
      "Not running in another race",
      i.otherRace ? `You are already running in the ${i.otherRace}. Withdraw from it first.` : null
    )
  );
  for (const rule of i.deferredRules) {
    out.push({ id: "later", label: rule, status: "later", reason: "Checked when you file." });
  }
  return out;
}

export function firstFailedCheck(checks: EntryCheck[]): EntryCheck | null {
  return checks.find((c) => c.status === "fail") ?? null;
}

export interface EntryScheduleInput {
  currentTurn: number | null;
  primaryEndTurn: number | null;
  endTurn: number | null;
}

/** Turns are one real hour each. */
export function approximateTurnsAhead(turns: number): string {
  if (turns <= 0) return "now";
  if (turns < 48) return `about ${turns} ${turns === 1 ? "hour" : "hours"}`;
  const days = Math.round(turns / 24);
  return `about ${days} days`;
}

function deadlineLine(label: string, target: number | null, current: number | null): string | null {
  if (target == null) return null;
  if (current == null) return `${label}: turn ${target}.`;
  return `${label}: turn ${target} (${approximateTurnsAhead(target - current)}).`;
}

export function scheduleLines(s: EntryScheduleInput): string[] {
  return [
    deadlineLine("Filing and primary close", s.primaryEndTurn, s.currentTurn),
    deadlineLine("General election ends", s.endTurn, s.currentTurn),
  ].filter((line): line is string => line !== null);
}

export interface FieldCandidate {
  party: string;
  partyName?: string;
}

export function fieldLine(
  candidates: FieldCandidate[] | null,
  incumbent: { name: string; party: string } | null
): string[] {
  const lines: string[] = [];
  if (candidates === null) return lines;
  if (candidates.length === 0) {
    lines.push("No one has filed yet.");
  } else {
    const byParty = new Map<string, number>();
    for (const c of candidates) {
      const name = c.partyName ?? c.party;
      byParty.set(name, (byParty.get(name) ?? 0) + 1);
    }
    const parties = [...byParty].map(([name, n]) => (n > 1 ? `${name} x${n}` : name)).join(", ");
    lines.push(
      `${candidates.length} ${candidates.length === 1 ? "candidate has" : "candidates have"} filed (${parties}).`
    );
  }
  if (incumbent) lines.push(`Incumbent: ${incumbent.name} (${incumbent.party}).`);
  return lines;
}

export const FILING_COST_LINES = [
  "Filing is free.",
  "Campaigning in this race spends actions and campaign funds.",
];

export function closedFilingLine(primaryEndTurn: number | null): string {
  return primaryEndTurn == null
    ? "Filing for this race is closed."
    : `Filing for this race closed on turn ${primaryEndTurn}.`;
}
