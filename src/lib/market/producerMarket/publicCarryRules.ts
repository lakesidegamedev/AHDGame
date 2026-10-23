/**
 * Public funding carry-forward (funded-market cutover). A public buyer's budget
 * line is a fixed per-turn outlay. When a commodity is short, that outlay goes
 * partly unfilled and the unspent money used to be burned at close, so the
 * buyer never gained purchasing power when supply finally landed. Here a share
 * of the unfilled part of each line stays in the public wallet and is added to
 * that same line next turn, capped at PUBLIC_CARRY_MAX_TURNS of the line's own fresh outlay (so a line can hold up to 1 + that many turns of fresh outlay in total).
 *
 * Nothing is minted: carried money was already funded by an earlier turn and is
 * simply not burned. Transition support and decommission grants are paid from
 * what is left after the carry is set aside.
 *
 * Pure: lines and settled order outcomes in, carry amounts out. Amounts are in
 * the same units as the order's maximumSpend (anchor).
 */
export const PUBLIC_CARRY_MAX_TURNS = 4;
export const PUBLIC_CARRY_DEFAULT_SHARE = 0.5;

export type LineCarry = Record<string, number>;

export function carryLineKey(commodity: string, book: string): string {
  return `${commodity}|${book}`;
}

/** The id publicOrders gives a public buyer's order for one line. */
export function publicOrderId(accountId: string, commodity: string, book: string): string {
  return `public:${accountId}:${commodity}:${book}`;
}

function positive(x: number | undefined): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

/** Adds last turn's carry to the matching lines. Carry for a line that no longer exists is dropped. */
export function withCarriedLines<
  T extends { commodity: string; book: string; amountLocal: number },
>(lines: readonly T[], carry: LineCarry | undefined): T[] {
  return lines.map((l) => {
    const extra = positive(carry?.[carryLineKey(l.commodity, l.book)]);
    return extra > 0 ? { ...l, amountLocal: l.amountLocal + extra } : { ...l };
  });
}

export interface CarryOrder {
  id: string;
  commodity: string;
  book: string;
  /** The line's order budget this turn: fresh outlay plus carried-in. */
  budget: number;
  /** The line's fresh outlay this turn. */
  fresh: number;
}

export interface CarryOutcome {
  id: string;
  requestedUnits: number;
  deliveredUnits: number;
}

/**
 * Next turn's carry for one buyer: share x unfilled budget per line, capped at
 * PUBLIC_CARRY_MAX_TURNS of the line's fresh outlay. The unfilled fraction is
 * measured in units, so it never overstates what stayed unspent.
 */
export function nextLineCarry(
  orders: readonly CarryOrder[],
  outcomes: readonly CarryOutcome[],
  share: number
): LineCarry {
  const s = Math.min(1, Math.max(0, share));
  if (!(s > 0)) return {};
  const byId = new Map(outcomes.map((o) => [o.id, o]));
  const out: LineCarry = {};
  for (const o of orders) {
    const r = byId.get(o.id);
    const requested = positive(r?.requestedUnits);
    if (!r || !(requested > 0) || !(o.budget > 0)) continue;
    const unfilled = Math.max(0, 1 - positive(r.deliveredUnits) / requested);
    const keep = Math.min(o.budget * unfilled * s, PUBLIC_CARRY_MAX_TURNS * positive(o.fresh));
    if (keep > 0) out[carryLineKey(o.commodity, o.book)] = keep;
  }
  return out;
}

export function carryTotal(carry: LineCarry | undefined): number {
  let sum = 0;
  for (const v of Object.values(carry ?? {})) sum += positive(v);
  return sum;
}

/** Scales a carry down to a ceiling (what the wallet really holds), keeping proportions. */
export function capCarry(carry: LineCarry, ceiling: number): LineCarry {
  const total = carryTotal(carry);
  const cap = positive(ceiling);
  if (total <= cap) return { ...carry };
  if (!(cap > 0)) return {};
  const f = cap / total;
  return Object.fromEntries(Object.entries(carry).map(([k, v]) => [k, v * f]));
}
