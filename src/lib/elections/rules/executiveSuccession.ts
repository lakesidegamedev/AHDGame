/**
 * Pure succession rules for national executives other than the US presidency.
 *
 * Plain data in, plain data out: callers pass the vacancy turn and read the
 * resulting deadlines. One entry per country and government type, because an
 * era can change who leads the executive (RU is a presidium state in 1953 and a
 * presidency in 2027). A missing entry throws so a new country cannot ship
 * without a decision.
 */

export type SuccessionFill =
  /** The deputy takes the office for the rest of the term. */
  | "deputy_permanent"
  /** A national election fills it. */
  | "direct_election"
  /** The legislature votes a successor. */
  | "legislature_vote"
  /** The governing party or its central body picks a successor. */
  | "party_vote"
  /** Normal government formation after the head of government leaves. */
  | "government_formation";

export interface SuccessionRule {
  /** Executive office key that falls vacant. */
  office: string;
  /** Office key of the deputy who acts, or null when someone without an office acts. */
  actingOffice: string | null;
  /** Who acts while the office is empty, for display. */
  actingLabel: string;
  /** Turns the acting holder may serve before the fill is overdue. */
  actingTurns: number;
  fill: SuccessionFill;
  /** Turns after the vacancy by which the fill must have happened. */
  fillWithinTurns: number;
}

export interface ExecutiveVacancy {
  rule: SuccessionRule;
  vacatedTurn: number;
  actingUntilTurn: number;
  fillByTurn: number;
}

export type SuccessionStage = "acting" | "awaiting_fill" | "overdue";

const NONE = 0;

const DEPUTY_PERMANENT = {
  actingTurns: NONE,
  fill: "deputy_permanent",
  fillWithinTurns: NONE,
} as const;

const DIRECT_ELECTION = {
  actingTurns: 168,
  fill: "direct_election",
  fillWithinTurns: 336,
} as const;

const LEGISLATURE_VOTE = {
  actingTurns: 48,
  fill: "legislature_vote",
  fillWithinTurns: 96,
} as const;

const PARTY_VOTE = {
  actingTurns: 24,
  fill: "party_vote",
  fillWithinTurns: 72,
} as const;

const FORMATION = {
  actingTurns: 48,
  fill: "government_formation",
  fillWithinTurns: 96,
} as const;

type RuleInput = Omit<SuccessionRule, "office" | "actingOffice" | "actingLabel"> &
  Partial<Pick<SuccessionRule, "actingOffice" | "actingLabel">>;

function rule(office: string, input: RuleInput): SuccessionRule {
  return { actingOffice: null, actingLabel: "Senior cabinet minister", ...input, office };
}

/** Parliamentary head of government: outgoing cabinet seniors act while a successor forms. */
const pm = (office = "primeMinister") => rule(office, FORMATION);

/** Party-state general secretary or premier: the central body picks. */
const partyChief = (office: string, actingLabel: string) =>
  rule(office, { ...PARTY_VOTE, actingLabel });

const SUCCESSION_RULES: Readonly<Record<string, SuccessionRule>> = {
  "US:presidential": rule("president", {
    ...DEPUTY_PERMANENT,
    actingOffice: "vicePresident",
    actingLabel: "Vice President",
  }),
  "BR:presidential": rule("president", {
    ...DEPUTY_PERMANENT,
    actingOffice: "vicePresident",
    actingLabel: "Vice President",
  }),
  "NG:presidential": rule("president", {
    ...DEPUTY_PERMANENT,
    actingOffice: "vicePresident",
    actingLabel: "Vice President",
  }),
  "FR:presidential": rule("president", {
    ...DIRECT_ELECTION,
    actingOffice: "primeMinister",
    actingLabel: "Prime Minister",
  }),
  "RU:presidential": rule("president", {
    ...DIRECT_ELECTION,
    actingOffice: "primeMinister",
    actingLabel: "Prime Minister",
  }),
  "RO:presidential": rule("president", {
    ...DIRECT_ELECTION,
    actingLabel: "President of the Senate",
  }),
  "YU:presidential": rule("president", {
    ...LEGISLATURE_VOTE,
    actingLabel: "Speaker of the Assembly",
  }),

  "UK:parliamentaryMonarchy": pm(),
  "CA:parliamentaryMonarchy": pm(),
  "JP:parliamentaryMonarchy": pm(),
  "ES:parliamentaryMonarchy": pm(),
  "SE:parliamentaryMonarchy": pm(),
  "GR:parliamentaryMonarchy": pm(),
  "DE:parliamentaryRepublic": rule("chancellor", FORMATION),
  "AT:parliamentaryRepublic": pm(),
  "IE:parliamentaryRepublic": rule("taoiseach", {
    ...FORMATION,
    actingOffice: "tanaiste",
    actingLabel: "Tánaiste",
  }),
  "IT:parliamentaryRepublic": pm(),
  "FI:parliamentaryRepublic": pm(),
  "TR:parliamentaryRepublic": pm(),
  "GR:parliamentaryRepublic": pm(),
  "HU:parliamentaryRepublic": pm(),
  "PL:parliamentaryRepublic": pm(),
  "BG:parliamentaryRepublic": pm(),
  "CS:parliamentaryRepublic": pm(),
  "YU:parliamentaryRepublic": pm(),
  "RU:parliamentaryRepublic": pm(),
  "FR:parliamentaryRepublic": pm(),
  "SCO:parliamentaryRepublic": pm(),
  "WAL:parliamentaryRepublic": pm(),

  "CN:onePartyState": partyChief("premier", "Vice Premier"),
  "RU:onePartyState": partyChief("premier", "First Deputy Premier"),
  "HU:onePartyState": partyChief("generalSecretary", "Politburo secretary"),
  "PL:onePartyState": partyChief("firstSecretary", "Politburo secretary"),
  "RO:onePartyState": partyChief("generalSecretary", "Politburo secretary"),
  "BG:onePartyState": partyChief("generalSecretary", "Politburo secretary"),
  "CS:onePartyState": partyChief("generalSecretary", "Politburo secretary"),
  "DD:onePartyState": partyChief("generalSecretary", "Politburo secretary"),
  "YU:onePartyState": rule("president", { ...PARTY_VOTE, actingLabel: "Collective presidency" }),
  "ES:onePartyState": rule("primeMinister", { ...PARTY_VOTE, actingLabel: "Council of Ministers" }),
  "BLR:onePartyState": partyChief("generalSecretary", "Politburo secretary"),
  "BAL:onePartyState": partyChief("generalSecretary", "Politburo secretary"),
  "UKR:onePartyState": partyChief("generalSecretary", "Politburo secretary"),
};

export function successionRuleKey(countryId: string, governmentType: string): string {
  return `${countryId}:${governmentType}`;
}

export function getSuccessionRuleKeys(): string[] {
  return Object.keys(SUCCESSION_RULES);
}

/** The rule for a country under a government type. Throws when none is defined. */
export function getSuccessionRule(countryId: string, governmentType: string): SuccessionRule {
  const found = SUCCESSION_RULES[successionRuleKey(countryId, governmentType)];
  if (!found) {
    throw new Error(`No executive succession rule for ${countryId} (${governmentType})`);
  }
  return found;
}

/** Turns the unavailable-deputy fallback waits for a special election to be called. */
const NO_DEPUTY_ACTING_TURNS = 24;
/** Turns after the vacancy by which the unavailable-deputy fallback must have filled the office. */
const NO_DEPUTY_FILL_WITHIN_TURNS = 240;

/**
 * Rule for a permanent-deputy presidency whose deputy cannot take over: the
 * deputy seat is empty too (a double vacancy) or the deputy is barred from the
 * office. With no one in line the office goes to a special presidential
 * election, so it always fills instead of waiting for the next regular one.
 */
export function deputyUnavailableRule(base: SuccessionRule): SuccessionRule {
  if (base.fill !== "deputy_permanent") return base;
  return {
    ...base,
    actingOffice: null,
    actingLabel: "Cabinet (no successor in line)",
    actingTurns: NO_DEPUTY_ACTING_TURNS,
    fill: "direct_election",
    fillWithinTurns: NO_DEPUTY_FILL_WITHIN_TURNS,
  };
}

export function openExecutiveVacancy(rule: SuccessionRule, vacatedTurn: number): ExecutiveVacancy {
  return {
    rule,
    vacatedTurn,
    actingUntilTurn: vacatedTurn + rule.actingTurns,
    fillByTurn: vacatedTurn + rule.fillWithinTurns,
  };
}

export function successionStage(
  vacancy: Pick<ExecutiveVacancy, "actingUntilTurn" | "fillByTurn">,
  currentTurn: number
): SuccessionStage {
  if (currentTurn > vacancy.fillByTurn) return "overdue";
  if (currentTurn > vacancy.actingUntilTurn) return "awaiting_fill";
  return "acting";
}
