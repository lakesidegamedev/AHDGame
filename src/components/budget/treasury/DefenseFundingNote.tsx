"use client";

import type { DefenseFundingPosition } from "@/lib/publicFinance/queries/defenseFunding";
import type { OrganizationContributionPosition } from "@/lib/publicFinance/queries/organizationContributions";
import { formatFundsCompact1dp } from "@/lib/utils/formatters";

/** Two decimals so a row of near-equal lines still adds up to the shown total. */
function formatMoney2dp(amount: number, sym: string): string {
  const abs = Math.abs(amount);
  if (abs >= 1e12) return `${sym}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sym}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sym}${(abs / 1e6).toFixed(2)}M`;
  return `${sym}${abs.toFixed(0)}`;
}

function formatDuesRate(rateAnnual: number): string {
  return `${parseFloat((rateAnnual * 100).toFixed(4))}%`;
}

export interface DefenseFundingNoteProps {
  sym: string;
  funding: DefenseFundingPosition;
  /**
   * Signed per-turn State Enterprises net, in the same local currency as the
   * other tiles (`stateEnterpriseNet` from the budget detail query: remitted
   * profit when positive, treasury-backed operating losses when negative).
   * Null/undefined omits the enterprise figure. Read-only like the rest.
   */
  soeNetPerTurn?: number | null;
  /** Recurring dues or tribute debited directly from the treasury per turn. */
  organizationContributions?: OrganizationContributionPosition | null;
  /** Whole-budget balance per turn (revenue less spending). Negative is a deficit. */
  budgetBalancePerTurn?: number | null;
}

/**
 * Defence funding reconciliation. The surplus tile counts the enacted defence
 * line, while the standing force settles through an appropriation pot: a gap
 * can create treasury debt without a spending row, and loss-making National
 * Corporations are backed from the treasury the same way. This memo puts each
 * per-turn draw next to the surplus tile so a falling treasury under a surplus
 * reconciles on screen. Read-only; the turn phase is the sole writer of pots.
 */
export function DefenseFundingNote({
  sym,
  funding,
  soeNetPerTurn,
  organizationContributions,
  budgetBalancePerTurn,
}: DefenseFundingNoteProps) {
  const money = (n: number) => formatFundsCompact1dp(n, sym);
  const money2 = (n: number) => formatMoney2dp(n, sym);
  const wholeDeficit =
    budgetBalancePerTurn != null && budgetBalancePerTurn < 0 ? -budgetBalancePerTurn : 0;
  const moneySigned = (n: number) =>
    `${n < 0 ? "-" : ""}${formatFundsCompact1dp(Math.abs(n), sym)}`;
  const overdrawn = (funding.potBalance ?? 0) < 0;
  const treasuryDraw = Math.max(0, funding.treasuryDrawPerTurn);
  const soeBacking = soeNetPerTurn != null ? Math.max(0, -soeNetPerTurn) : 0;
  const organizationBacking = Math.max(0, organizationContributions?.perTurn ?? 0);
  const draws: string[] = [];
  if (treasuryDraw > 0) {
    draws.push(`${money(treasuryDraw)} new defence debt beyond the defence line`);
  }
  if (soeBacking > 0) draws.push(`${money(soeBacking)} state enterprise backing`);
  if (organizationBacking > 0) {
    draws.push(`${money(organizationBacking)} international organization contributions`);
  }

  return (
    <section
      aria-label="Defence funding"
      className="rounded-xl border border-card-border bg-card p-4"
    >
      <div className="text-sm font-semibold text-foreground">Defence funding</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        <div>
          <div className="text-body-sm font-medium text-muted">Appropriated per turn</div>
          <div className="mt-0.5 font-mono text-body-sm font-semibold text-foreground">
            {money(funding.accrualPerTurn)}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted">
            This turn&apos;s slice of the enacted line ({money(funding.lineAnnual)}/yr), the figure
            the surplus counts.
          </p>
        </div>
        <div>
          <div className="text-body-sm font-medium text-muted">Force upkeep per turn</div>
          <div className="mt-0.5 font-mono text-body-sm font-semibold text-foreground">
            {money(funding.upkeepPerTurn)}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted">
            What {funding.unitCount} standing units (every land, sea, air and space unit, not just
            naval and air formations) cost, whether the line covers it or not.
          </p>
        </div>
        <div>
          <div className="text-body-sm font-medium text-muted">New defence debt per turn</div>
          <div className="mt-0.5 font-mono text-body-sm font-semibold text-foreground">
            {money(treasuryDraw)}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted">
            Defence only: new debt after the appropriation pot applies this turn&apos;s accrual and
            upkeep. Existing appropriation debt is not charged again. It is not the whole budget
            deficit.
          </p>
        </div>
        {wholeDeficit > 0 ? (
          <div>
            <div className="text-body-sm font-medium text-muted">Whole-budget deficit per turn</div>
            <div className="mt-0.5 font-mono text-body-sm font-semibold text-foreground">
              {money(wholeDeficit)}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              One turn&apos;s share of annual spending above revenue, all lines included. It is
              borrowed through bond sales, separately from the defence draw.
            </p>
          </div>
        ) : null}
        <div>
          <div className="text-body-sm font-medium text-muted">Appropriation balance</div>
          <div className="mt-0.5 font-mono text-body-sm font-semibold text-foreground">
            {funding.potBalance == null ? "—" : moneySigned(funding.potBalance)}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted">
            {overdrawn
              ? funding.potChangePerTurn > 0
                ? "Overdrawn: running total of past shortfalls already borrowed against the treasury. This turn is paying it down, so that old debt is not charged a second time."
                : "Overdrawn: running total of past shortfalls already borrowed against the treasury. A new draw is added only when closing debt exceeds the opening debt; appropriate more or field less, and covered turns pay it down."
              : "The pot still covers the force; no overdraft drawn. It rises when the line exceeds upkeep and falls when upkeep exceeds the line."}
          </p>
        </div>
        {soeBacking > 0 ? (
          <div>
            <div className="text-body-sm font-medium text-muted">
              State enterprise backing per turn
            </div>
            <div className="mt-0.5 font-mono text-body-sm font-semibold text-foreground">
              {money(soeBacking)}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              Loss-making National Corporations, covered from the treasury. Like the defence draw,
              it never appears in spending.
            </p>
          </div>
        ) : null}
        {organizationBacking > 0 ? (
          <div>
            <div className="text-body-sm font-medium text-muted">
              International organization contributions per turn
            </div>
            <div className="mt-0.5 font-mono text-body-sm font-semibold text-foreground">
              {money2(organizationBacking)}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              Dues or tribute for current memberships. Charged directly to the treasury and not
              included in annual spending.
            </p>
            {organizationContributions?.lines.length ? (
              <ul className="mt-2 space-y-1 text-[11px] leading-snug text-muted">
                {organizationContributions.lines.map((line) => (
                  <li key={`${line.organizationId}:${line.kind}`}>
                    {line.organizationName ?? line.organizationId.replaceAll("_", " ")} {line.kind}:{" "}
                    {money2(line.perTurn)}
                    {line.rateAnnual != null
                      ? ` (${formatDuesRate(line.rateAnnual)} of GDP a year${
                          line.isDefaultRate
                            ? ", the default rate until members vote a different one"
                            : ""
                        })`
                      : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
      {draws.length > 0 ? (
        <p className="mt-3 border-t border-card-border pt-3 text-[11px] leading-snug text-muted">
          Treasury check: each turn the balance moves by roughly this turn&apos;s slice of the
          surplus, minus {draws.join(" plus ")}. These direct draws do not appear in spending, so
          the surplus reads high by {money(treasuryDraw + soeBacking + organizationBacking)}. That
          is why the treasury can fall while the surplus stays green.
          {soeNetPerTurn == null ? " State enterprise backing is not shown here." : null}
        </p>
      ) : (
        <p className="mt-3 border-t border-card-border pt-3 text-[11px] leading-snug text-muted">
          Treasury check: no new defence debt is drawn by the current appropriation settlement.
          International organization contributions are shown separately when applicable.
        </p>
      )}
    </section>
  );
}
