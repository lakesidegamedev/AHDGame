/**
 * Election-year helpers that need the canonical cycle anchor table.
 *
 * Everything else is re-exported from `formattersCore`, which is what client
 * surfaces import. Keeping this file separate means a status bar or currency
 * provider does not pull the per-preset election-year table into the browser.
 */
import {
  COUNTRIES_WITH_CONCURRENT_GENERAL_ELECTIONS,
  type CountryId,
} from "@/lib/constants/countriesCore";
import { STARTING_YEAR } from "@/lib/constants/calendar";
import { calendarTurn, type CalendarClock } from "@/lib/utils/gameDate";
import {
  CANONICAL_REAL_ELECTION_YEARS_BY_PRESET,
  DEFAULT_CYCLE_ANCHOR_CONTEXT,
  type CycleAnchorContext,
} from "@/lib/elections/cycleAnchorContext";

export * from "./formattersCore";

/**
 * Compute the LARP election year from election metadata.
 * Returns the year the general election takes place (voting year).
 *
 * `ctx` selects the preset's real-world election-year anchors via
 * `CANONICAL_REAL_ELECTION_YEARS_BY_PRESET`. For the 2019-default preset
 * (the back-compat default) cycle 1 of US House is 2022, UK GE is 2024,
 * etc. For the 1991-default preset cycle 1 of US House is 1992, UK GE
 * is 1992, etc.
 */
/**
 * Resolve a baked `electionYear` if present on the doc, else fall back to
 * cycle-derived math under the caller-supplied ctx. New elections always
 * have `electionYear` baked at spawn (see Election type); this helper keeps
 * legacy/un-backfilled docs displaying correctly under the active preset
 * without each call site repeating the `?? electionToLarpYear(...)` dance.
 */
export function resolveElectionYear(
  election: {
    electionType: string;
    cycle: number;
    electionYear?: number | null;
    senateClass?: number | null;
    chamberClass?: number | null;
  },
  ctx: CycleAnchorContext = DEFAULT_CYCLE_ANCHOR_CONTEXT
): number {
  if (election.electionYear != null) return election.electionYear;
  return electionToLarpYear(
    election.electionType,
    election.cycle,
    election.senateClass,
    election.chamberClass,
    ctx
  );
}

export function electionToLarpYear(
  electionType: string,
  cycle: number,
  senateClass?: number | null,
  chamberClass?: number | null,
  ctx: CycleAnchorContext = DEFAULT_CYCLE_ANCHOR_CONTEXT,
  countryId?: CountryId
): number {
  // Cycle 0 is the pre-iteration "founding" election: it happens at the pinned
  // era start, so it is labeled with the starting year (not a pre-anchor year).
  if (cycle === 0) return ctx.startingYear;
  const years =
    CANONICAL_REAL_ELECTION_YEARS_BY_PRESET[ctx.preset] ??
    CANONICAL_REAL_ELECTION_YEARS_BY_PRESET["2019-default"];
  // Concurrent-general countries (NG): all four general offices share the
  // `ngGeneral` LARP year on a 4-year cadence, matching the schedule in
  // `canonicalTurnsForCycle`.
  const CONCURRENT_GENERAL_TYPES = new Set([
    "president",
    "house",
    "senate",
    "governor",
    "stateSenate",
  ]);
  if (
    countryId != null &&
    COUNTRIES_WITH_CONCURRENT_GENERAL_ELECTIONS.has(countryId) &&
    CONCURRENT_GENERAL_TYPES.has(electionType)
  ) {
    return years.ngGeneral + (cycle - 1) * 4;
  }
  if (ctx.preset === "1991-default") {
    if (countryId === "RO" && (electionType === "chamberOfDeputies" || electionType === "senat")) {
      return 1992 + (cycle - 1) * 4;
    }
    if ((electionType === "sejm" || electionType === "senat") && countryId === "PL") {
      return cycle === 1 ? (years.plSejm ?? 1991) : (years.plSejm ?? 1991) + 2 + (cycle - 2) * 4;
    }
    if (electionType === "chamberOfThePeople" || electionType === "chamberOfNations") {
      return (years.csFederalAssembly ?? 1992) + (cycle - 1) * 2;
    }
    if (electionType === "nationalAssembly" && countryId === "HU") {
      return (years.huNationalAssembly ?? 1994) + (cycle - 1) * 4;
    }
    if (electionType === "unionCongressDeputy") {
      return (years.ruUnionCongress ?? 1994) + (cycle - 1) * 5;
    }
  }
  switch (electionType) {
    case "house":
      // 2-year cycles
      return years.house + (cycle - 1) * 2;
    case "senate": {
      // BR Federal Senate: 4-year cycle riding its own `brSenate` anchor —
      // see BR_SENATE_CYCLE_PERIOD_HOURS in canonicalCycle.ts for the
      // full-chamber staggering-simplification note.
      if (countryId === "BR") {
        return years.brSenate + (cycle - 1) * 4;
      }
      // 6-year cycles, staggered by class
      const klass = senateClass ?? 2;
      const firstYear =
        klass === 1 ? years.senateClass1 : klass === 2 ? years.senateClass2 : years.senateClass3;
      return firstYear + (cycle - 1) * 6;
    }
    case "president":
      // 4-year cycles
      return years.president + (cycle - 1) * 4;
    case "governor":
    case "special_governor":
    case "stateSenate":
      // 4-year mid-term cycles. A governor by-election's cycle is an off-calendar
      // marker, so its computed year is approximate — display sites prefer the
      // doc's stored electionYear when present. RU First Secretaries ride the
      // republic-soviet cycle (D10) and DD Land First Secretaries the
      // Volkskammer cycle — same anchor overrides as canonicalCycle.
      if (countryId === "RU") {
        return (years.ruRepublicSoviet ?? years.governorStateSenate) + (cycle - 1) * 4;
      }
      if (countryId === "DD") {
        return (years.ddVolkskammer ?? years.governorStateSenate) + (cycle - 1) * 4;
      }
      return years.governorStateSenate + (cycle - 1) * 4;
    case "commons":
    case "snap_commons":
    case "special_commons":
    case "regionalCouncil":
      // 5-year UK Commons cycle
      return years.ukCommons + (cycle - 1) * 5;
    case "shugiin":
    case "snap_shugiin":
      // 4-year JP Shugiin cycle
      return years.jpShugiin + (cycle - 1) * 4;
    case "bundestag":
    case "snap_bundestag":
      // 4-year DE Bundestag cycle
      return years.deBundestag + (cycle - 1) * 4;
    case "landtag":
    case "ministerPresident":
      // 5-year cycles. Real-world per-Land election years are staggered,
      // but the cycle-1 anchor at the preset level is the preset's
      // canonical Landtag year (1995 for 1991-default, 2026 for
      // 2019-default). Per-Land overrides live in
      // LANDTAG_CYCLE1_END_TURN_BY_LAND for the spawn-side turn math;
      // for the year label we use the preset-level anchor.
      return years.deLandtag + (cycle - 1) * 5;
    case "supremeSovietDeputy":
    case "nationalitiesDeputy":
      // RU: both national chambers share the ruSupremeSoviet anchor, 4-year
      // cadence (D3). Null-anchored presets never spawn these; the fallback
      // only guards display totality for malformed docs.
      return (years.ruSupremeSoviet ?? years.governorStateSenate) + (cycle - 1) * 4;
    case "republicSupremeSoviet":
      return (years.ruRepublicSoviet ?? years.governorStateSenate) + (cycle - 1) * 4;
    case "volkskammerDeputy":
      // DD: single-list Volkskammer, 4-year cadence (mirrors RU; the 192-turn
      // cycle table drives scheduling). Fallback guards display totality only.
      return (years.ddVolkskammer ?? years.governorStateSenate) + (cycle - 1) * 4;
    case "landAssembly":
      // DD Landtage ride the Volkskammer cycle (same anchor as Land First
      // Secretaries). Distinct key from DE `landtag` (5-year Sainte-Laguë).
      return (years.ddVolkskammer ?? years.governorStateSenate) + (cycle - 1) * 4;
    case "npcDelegate":
    case "peoplesCongress":
      // CN: 5-year cycle. 14th NPC → 2023 for 2019-default; 8th NPC →
      // 1993 for 1991-default. Same anchor for both NPC delegates and
      // Provincial People's Congresses (they sync).
      return years.cnNpcDelegate + (cycle - 1) * 5;
    case "sangiin": {
      // 3-year half-elections, two classes
      const cls = chamberClass ?? senateClass;
      const sangiinFirstYear = cls === 2 ? years.jpSangiinClass2 : years.jpSangiinClass1;
      return sangiinFirstYear + (cycle - 1) * 3;
    }
    case "dail":
      // IE Dáil Éireann — 4-year cycle (modelled), anchored on the preset's
      // ieDail year (2024 for 2019-default, 1992 for 1991-default).
      return years.ieDail + (cycle - 1) * 4;
    case "uachtaran":
      // IE Uachtarán na hÉireann — 7-year direct nationwide cycle, anchored
      // on the preset's ieUachtaran year (2025 / 1997).
      return years.ieUachtaran + (cycle - 1) * 7;
    case "localCouncil":
      // IE Local Council — 5-year synchronized cycle, anchored on the
      // preset's ieLocalCouncil year (2024 / 1991), matching the EP cycle.
      return years.ieLocalCouncil + (cycle - 1) * 5;
    case "holyrood":
      // SCO Holyrood — 5-year AMS cycle, anchored on the preset's devolved
      // election year (2021 / 1999).
      return years.scoHolyrood + (cycle - 1) * 5;
    case "senedd":
      // WAL Senedd Cymru — 5-year AMS cycle, anchored on the preset's devolved
      // election year (2021 / 1999).
      return years.walSenedd + (cycle - 1) * 5;
    // Beta-country parliamentary lower chambers (FR/IT/ES/SE/TR) — periods
    // match BETA_PARLIAMENT_CYCLES in canonicalCycle.ts (FR/IT 5y, ES/SE/TR 4y).
    case "assembleeNationale":
      return years.frAssembly + (cycle - 1) * 5;
    case "cameraDeputati":
      return years.itCamera + (cycle - 1) * 5;
    case "congresoDiputados":
      // Era-gated presets (ES 1953) never spawn this type; the fallback only
      // guards display totality for malformed docs.
      return (years.esCongreso ?? years.governorStateSenate) + (cycle - 1) * 4;
    case "riksdag":
      return years.seRiksdag + (cycle - 1) * 4;
    case "milletMeclisi":
      return years.trMeclis + (cycle - 1) * 4;
    default:
      return years.governorStateSenate + (cycle - 1) * 4;
  }
}

/**
 * Compute the LARP election year from an election's endTime.
 *
 * Uses currentTurn + lastTurnProcessed for an absolute (not relative) calculation
 * so elections with a past endTime are labelled correctly.
 *
 * Elections that end exactly on "Week 1" of a new year are displayed as
 * "Week 52" of the previous year — matching turnToLarpDate's special-case for
 * turn 48 and honouring the user preference that a race barely crossing a year
 * boundary keeps the prior year's label.
 *
 * @param endTime - ISO string or Date for the election's endTime
 * @param currentTurn - Current game turn (1-based)
 * @param lastTurnProcessed - Real-world timestamp of the last processed turn
 */
export function endTimeToGameYear(
  endTime: string | Date,
  currentTurn: number,
  lastTurnProcessed: string | Date,
  startingYear: number = STARTING_YEAR,
  /**
   * Founding-phase clock. `currentTurn` is RAW, so without it an election year
   * reads a game year ahead of the status bar on a world that burned turns
   * before its calendar started (#1208).
   */
  clock?: CalendarClock
): number {
  const TURNS_PER_YEAR = 48;
  const MS_PER_TURN = 3_600_000;

  const end = new Date(endTime);
  const ref = new Date(lastTurnProcessed);
  const turnsFromNow = Math.round((end.getTime() - ref.getTime()) / MS_PER_TURN);
  // Convert to the display calendar BEFORE the boundary test, so the "Week 1
  // belongs to the previous year" rule is applied to the year players see.
  const turnAtEnd = calendarTurn(currentTurn + turnsFromNow, clock);

  // Treat elections ending on "Week 1" of year N as belonging to year N-1
  // (same logic as turnToLarpDate's turn-48 → Week 52 special case).
  const isAtYearBoundary = turnAtEnd > 1 && (turnAtEnd - 1) % TURNS_PER_YEAR === 0;
  const effectiveTurn = isAtYearBoundary ? turnAtEnd - 1 : turnAtEnd;

  return startingYear + Math.floor((effectiveTurn - 1) / TURNS_PER_YEAR);
}
