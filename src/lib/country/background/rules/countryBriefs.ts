/**
 * Background country briefs: what each of the 16 background countries tells the
 * wire and its own page, and when.
 *
 * A brief reports a change in a country's national state (rating, debt stress,
 * currency, election, austerity, restructuring), with a quiet periodic outlook so
 * every country speaks now and then. Each carries actions into existing flows:
 * its bonds, its index fund, its currency market and world trade. The first look
 * at a country only records what is true, so a deploy never floods the wire.
 *
 * Pure: plain data in, plain data out.
 */

export type BriefKind =
  "debt_stress" | "election" | "currency_move" | "austerity" | "restructuring" | "outlook";

/** Turns between two briefs of the same kind for one country. */
export const BRIEF_COOLDOWN_TURNS: Record<BriefKind, number> = {
  debt_stress: 24,
  election: 0,
  currency_move: 36,
  austerity: 0,
  restructuring: 0,
  outlook: 96,
};
/** Debt to GDP, percent, at or above which a country is reported as under debt stress. */
export const DEBT_STRESS_RATIO_PERCENT = 100;
/** Turns the currency move is measured over. */
export const CURRENCY_WINDOW_TURNS = 24;
/** Move in the currency's strength over the window, percent, that earns a brief. */
export const CURRENCY_MOVE_PERCENT = 8;
/** The briefs shown on a country page. */
export const BRIEFS_ON_PAGE = 6;

export interface BriefAction {
  kind: "bonds" | "index_fund" | "currency" | "trade";
  label: string;
  href: string;
}

export interface BriefDraft {
  kind: BriefKind;
  headline: string;
  body: string;
  actions: BriefAction[];
}

export interface BriefObservation {
  countryId: string;
  countryName: string;
  turn: number;
  currencyCode: string | null;
  /** Percent of GDP; null when the budget has no figure. */
  debtToGdp: number | null;
  creditRating: string | null;
  /** Annual percent. */
  growth: number | null;
  inflation: number | null;
  /** Years debt interest has taken more than half of revenue. */
  interestSpiralYears: number;
  lastPackage: {
    turn: number;
    fiscalYear: number;
    sizeGdpShare: number;
    taxRise: number;
    spendingCut: number;
  } | null;
  election: { turn: number; year: number; snap: boolean; governmentChanged: boolean } | null;
  headName: string | null;
  /** Turn a sovereign crisis last fired (auction failures or an interest spiral). */
  crisisFiredTurn: number | null;
  fx: { rate: number; history: { turn: number; value: number }[] } | null;
  /** First bond on offer (nearest maturity), if any. */
  bond: { id: string; couponRate: number; marketPrice: number } | null;
  fund: { slug: string; countryId: string | null; name: string } | null;
}

/** What the last look at a country saw, kept on its macro document. */
export interface BriefMemory {
  lastByKind: Partial<Record<BriefKind, number>>;
  rating: string | null;
  spiralYears: number;
  electionTurn: number | null;
  packageTurn: number | null;
  crisisTurn: number | null;
}

export interface BriefPlan {
  briefs: BriefDraft[];
  memory: BriefMemory;
}

/** Stable 0..max-1 spread for a country id, so outlooks do not all land on one turn. */
export function outlookStagger(countryId: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < countryId.length; i++) hash = (hash * 31 + countryId.charCodeAt(i)) >>> 0;
  return hash % Math.max(1, max);
}

/** Currency strength change, percent, from `windowTurns` ago to now. Positive: it rose. */
export function currencyMovePercent(
  fx: BriefObservation["fx"],
  turn: number,
  windowTurns = CURRENCY_WINDOW_TURNS
): number | null {
  if (!fx || !(fx.rate > 0)) return null;
  const target = turn - windowTurns;
  let anchor: { turn: number; value: number } | null = null;
  for (const point of fx.history) {
    if (!(point.value > 0) || point.turn > target) continue;
    if (!anchor || point.turn > anchor.turn) anchor = point;
  }
  if (!anchor) return null;
  // The rate is local units per anchor unit: a smaller rate is a stronger currency.
  return (anchor.value / fx.rate - 1) * 100;
}

const pct = (value: number, digits = 1): string => `${value.toFixed(digits)}%`;

export function briefActions(obs: BriefObservation): BriefAction[] {
  const code = obs.countryId.toLowerCase();
  const actions: BriefAction[] = [
    {
      kind: "bonds",
      label: `Buy ${obs.countryId} bonds`,
      href: obs.bond ? `/bond/${encodeURIComponent(obs.bond.id)}` : "/market?tab=bonds",
    },
  ];
  if (obs.fund) {
    actions.push({
      kind: "index_fund",
      label: `Buy ${obs.fund.name}`,
      href: `/stockmarket/${(obs.fund.countryId ?? "global").toLowerCase()}/fund/${encodeURIComponent(obs.fund.slug)}`,
    });
  }
  if (obs.currencyCode) {
    actions.push({
      kind: "currency",
      label: `Trade ${obs.currencyCode}`,
      href: `/country/${code}/forex`,
    });
  }
  actions.push({ kind: "trade", label: "World trade", href: "/world/trade" });
  return actions;
}

function bondLine(obs: BriefObservation): string {
  return obs.bond
    ? ` Its nearest bond pays ${obs.bond.couponRate.toFixed(2)}% and trades at ${(obs.bond.marketPrice * 100).toFixed(1)}.`
    : "";
}

function ready(
  memory: BriefMemory,
  kind: BriefKind,
  turn: number,
  cooldown = BRIEF_COOLDOWN_TURNS[kind]
): boolean {
  const last = memory.lastByKind[kind];
  return last === undefined || turn - last >= cooldown;
}

/**
 * Which briefs a country owes now, and the memory to carry forward. `memory` is
 * null on the first look: nothing is posted, the current state is recorded.
 */
export function planBriefs(obs: BriefObservation, memory: BriefMemory | null): BriefPlan {
  const next: BriefMemory = {
    lastByKind: { ...(memory?.lastByKind ?? {}) },
    rating: obs.creditRating,
    spiralYears: obs.interestSpiralYears,
    electionTurn: obs.election?.turn ?? memory?.electionTurn ?? null,
    packageTurn: obs.lastPackage?.turn ?? memory?.packageTurn ?? null,
    crisisTurn: obs.crisisFiredTurn ?? memory?.crisisTurn ?? null,
  };
  if (!memory) {
    next.lastByKind.outlook =
      obs.turn - outlookStagger(obs.countryId, BRIEF_COOLDOWN_TURNS.outlook);
    return { briefs: [], memory: next };
  }

  const briefs: BriefDraft[] = [];
  const actions = briefActions(obs);
  const emit = (kind: BriefKind, headline: string, body: string) => {
    briefs.push({ kind, headline, body, actions });
    next.lastByKind[kind] = obs.turn;
  };

  // A restructuring outranks the debt stress that led to it.
  const restructured =
    obs.crisisFiredTurn !== null &&
    (memory.crisisTurn === null || obs.crisisFiredTurn > memory.crisisTurn);
  if (restructured) {
    emit(
      "restructuring",
      `${obs.countryName} restructures its debt`,
      `${obs.countryName} could no longer carry its interest bill and has restructured its sovereign debt: bondholders take a haircut, maturities are extended and the market is closed to new issues for a while. Holders of its bonds and funds are marked down.${bondLine(obs)}`
    );
  } else {
    const downgraded =
      memory.rating !== null && obs.creditRating !== null && obs.creditRating !== memory.rating;
    const spiralWorse = obs.interestSpiralYears > memory.spiralYears;
    const stressed = obs.debtToGdp !== null && obs.debtToGdp >= DEBT_STRESS_RATIO_PERCENT;
    if (
      ready(memory, "debt_stress", obs.turn) &&
      (downgraded || spiralWorse || (stressed && memory.lastByKind.debt_stress === undefined))
    ) {
      const parts: string[] = [];
      if (downgraded)
        parts.push(`its credit rating moved from ${memory.rating} to ${obs.creditRating}`);
      if (spiralWorse) {
        parts.push(
          `debt interest has now taken more than half of revenue for ${obs.interestSpiralYears} fiscal ${obs.interestSpiralYears === 1 ? "year" : "years"} running (two triggers a restructuring)`
        );
      }
      if (stressed && obs.debtToGdp !== null)
        parts.push(`debt stands at ${pct(obs.debtToGdp, 0)} of GDP`);
      emit(
        "debt_stress",
        `${obs.countryName} debt under strain`,
        `In ${obs.countryName}, ${parts.join("; ")}.${bondLine(obs)} Thin demand can push yields up and bond prices down.`
      );
    }
  }

  if (obs.election && (memory.electionTurn === null || obs.election.turn > memory.electionTurn)) {
    const outcome = obs.election.governmentChanged
      ? "The government changed hands"
      : "The government held on";
    emit(
      "election",
      `${obs.countryName} ${obs.election.snap ? "snap election" : "election"}: ${
        obs.election.governmentChanged ? "new government" : "government returned"
      }`,
      `${outcome} in ${obs.countryName}'s ${obs.election.year} ${obs.election.snap ? "snap " : ""}national election.${
        obs.headName ? ` ${obs.headName} leads the government.` : ""
      } Markets reprice the new fiscal stance through bonds, the index and the currency.`
    );
  }

  if (
    obs.lastPackage &&
    (memory.packageTurn === null || obs.lastPackage.turn > memory.packageTurn)
  ) {
    const pkg = obs.lastPackage;
    emit(
      "austerity",
      `${obs.countryName} announces an austerity package`,
      `${obs.countryName} will consolidate its budget by ${pct(pkg.sizeGdpShare * 100)} of GDP in fiscal year ${pkg.fiscalYear}: tax rises of ${pct(pkg.taxRise * 100)} of GDP and spending cuts of ${pct(pkg.spendingCut * 100)} of GDP. Expect a weaker economy and a hit to the government's approval, and a stronger budget for bondholders.${bondLine(obs)}`
    );
  }

  const move = currencyMovePercent(obs.fx, obs.turn);
  if (
    move !== null &&
    Math.abs(move) >= CURRENCY_MOVE_PERCENT &&
    ready(memory, "currency_move", obs.turn)
  ) {
    const code = obs.currencyCode ?? "its currency";
    emit(
      "currency_move",
      `${code} ${move > 0 ? "rallies" : "slides"}`,
      `${code} has ${move > 0 ? "gained" : "lost"} ${pct(Math.abs(move))} against the anchor over the last ${CURRENCY_WINDOW_TURNS} turns. ${
        move > 0
          ? "Exporters feel the pressure; holders of the currency are ahead."
          : "Imports get dearer for it; its exporters gain an edge."
      }`
    );
  }

  if (briefs.length === 0 && ready(memory, "outlook", obs.turn)) {
    const bits: string[] = [];
    if (obs.growth !== null) bits.push(`growth ${pct(obs.growth)}`);
    if (obs.inflation !== null) bits.push(`inflation ${pct(obs.inflation)}`);
    if (obs.debtToGdp !== null) bits.push(`debt ${pct(obs.debtToGdp, 0)} of GDP`);
    if (obs.creditRating) bits.push(`rated ${obs.creditRating}`);
    emit(
      "outlook",
      `${obs.countryName} outlook`,
      `${obs.countryName}: ${bits.length > 0 ? bits.join(", ") : "no new figures"}.${bondLine(obs)}`
    );
  }

  return { briefs, memory: next };
}
