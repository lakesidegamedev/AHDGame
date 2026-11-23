"use client";

import type { LastTurnReconciliation as Reconciliation } from "@/lib/corporations/rules/lastTurnReconciliation";
import { describeCostDriver } from "@/lib/corporations/rules/costBreakdown";
import {
  DenseSection,
  StatementGroup,
  StatementLine,
  StatementTable,
  signTone,
} from "../dense/DenseKit";

interface Props {
  data: Reconciliation;
  /** Whole-money formatters in the company's own currency. */
  fmt: (amount: number) => string;
  fmtSigned: (amount: number) => string;
}

/** "up 34% on the turn before" once the change is big enough to notice. */
export function costChangeNote(costs: number, previous: number | null): string | undefined {
  if (previous == null || !(previous > 0)) return undefined;
  const pct = Math.round(((costs - previous) / previous) * 100);
  if (Math.abs(pct) < 10) return undefined;
  return `${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% on the turn before`;
}

/**
 * One recorded turn, as the books closed it: the income statement, then the
 * change in cash on hand. Fixed to a single turn, so it ignores the period
 * selector and every figure is per turn in the company's own currency.
 */
export function LastTurnReconciliation({ data, fmt, fmtSigned }: Props) {
  const { statement, cash } = data;
  const round = (n: number) => Math.round(n);
  const cost = (n: number) => `(${fmt(round(n))})`;
  return (
    <DenseSection title={`Turn ${data.turn}, recorded`} meta="per turn, local currency">
      <p className="py-2 text-xs text-muted">
        What the turn actually booked. The Income statement below the estimate is a forecast for the
        next turn and can differ.
      </p>
      <StatementTable>
        <StatementGroup>Income, as recorded</StatementGroup>
        <StatementLine strong label="Revenue" amount={fmt(round(statement.revenue))} />
        <StatementLine
          indent
          label="Operating costs"
          amount={cost(statement.costs)}
          note={costChangeNote(statement.costs, statement.previousCosts)}
          title="Wages, upkeep and inputs for every sector. They rise when new capacity finishes and starts hiring."
        />
        {statement.costDrivers.map((driver) => (
          <StatementLine
            key={driver.category}
            indent
            label={describeCostDriver(driver, fmt)}
            amount={`${driver.after >= driver.before ? "+" : "-"}${fmt(round(Math.abs(driver.after - driver.before)))}`}
            title="A main reason operating costs moved, from the categories recorded for these two turns."
          />
        ))}
        {statement.costDriversUnrecorded && (
          <p className="py-1 pl-4 text-xs text-muted">
            Costs by type were not recorded for one of these turns, so only the total is shown.
          </p>
        )}
        {statement.tax > 0 && <StatementLine indent label="Tax" amount={cost(statement.tax)} />}
        {statement.otherParts.map((part) => (
          <StatementLine
            key={part.key}
            indent
            label={part.label}
            amount={fmtSigned(round(part.amount))}
            amountClass={signTone(part.amount)}
          />
        ))}
        {round(statement.otherUnitemised) !== 0 && (
          <StatementLine
            indent
            label={statement.otherUnitemisedLabel}
            amount={fmtSigned(round(statement.otherUnitemised))}
            amountClass={signTone(statement.otherUnitemised)}
            title="What is left between the operating result after tax and the retained income the turn recorded, after the lines above. Revenue less costs, tax and dividends, plus the lines above and this one, equals retained income."
          />
        )}
        {statement.dividendPaid > 0 && (
          <StatementLine indent label="Dividends" amount={cost(statement.dividendPaid)} />
        )}
        <StatementLine
          strong
          label="Retained income"
          amount={fmtSigned(round(statement.retained))}
          amountClass={signTone(statement.retained)}
        />

        <StatementGroup>Cash, as recorded</StatementGroup>
        {cash.before != null && (
          <StatementLine
            label="Cash at the end of the turn before"
            amount={fmt(round(cash.before))}
          />
        )}
        <StatementLine
          indent
          label="Retained income"
          amount={fmtSigned(round(cash.retained))}
          amountClass={signTone(cash.retained)}
        />
        {cash.lines.map((line) => (
          <StatementLine
            key={line.key}
            indent
            label={line.label}
            amount={fmtSigned(round(line.amount))}
            amountClass={signTone(line.amount)}
            title="Cash that moved outside the income statement."
          />
        ))}
        {cash.unitemised != null && round(cash.unitemised) !== 0 && (
          <StatementLine
            indent
            label={cash.unitemisedLabel}
            amount={fmtSigned(round(cash.unitemised))}
            amountClass={signTone(cash.unitemised)}
            title={cash.unitemisedNote}
          />
        )}
        <StatementLine
          strong
          label="Cash at the end of this turn"
          amount={fmt(round(cash.after))}
          note={cash.change != null ? `${fmtSigned(round(cash.change))} on the turn` : undefined}
        />
        {cash.now != null && (
          <StatementLine
            label="Cash now, after actions since"
            amount={fmt(round(cash.now))}
            title="Spending or income since the turn was recorded, such as a research unlock bought after it, appears in the next turn's walk."
          />
        )}
      </StatementTable>
    </DenseSection>
  );
}
