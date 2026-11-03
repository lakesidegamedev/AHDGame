import type { WikiChartBuilder } from "./types";
import { range, round } from "./economyHelpers";
import {
  INDEX_FUND_DIVIDEND_PASS_THROUGH_RATIO,
  INDEX_FUND_DIVIDEND_REINVEST_RATIO,
} from "@/lib/indexFunds/unitAccounting";
import {
  MAX_EXPENSE_RATIO_ANNUAL,
  MIN_EXPENSE_RATIO_ANNUAL,
  expenseFeeForTurn,
} from "@/lib/indexFunds/sponsorship/constants";
import { ARREARS_DEFAULT_TURNS } from "@/lib/banking/rules/loans";
import {
  SAVINGS_CREDIT_INTERVAL_TURNS,
  SAVINGS_REAL_RATE_FLOOR_PERCENT,
  computeSavingsInterestForTurn,
  savingsApyPercent,
} from "@/lib/currency/savingsInterest";
import {
  PRIME_STRESS_BASELINE_PERCENT,
  applyPrimeEnvironmentToComposite,
  incomeScoreFromPerTurnCurrency,
  netWorthScoreFromInternal,
  spreadPercentPointsFromComposite,
} from "@/lib/lineOfCredit/creditMath";
import {
  DEFAULT_BRANCH_CAPACITY_SHARE,
  DEPOSIT_CEILING_PER_CAPACITY_UNIT,
  computeDepositCeiling,
} from "@/lib/banking/rules/capacity";
import {
  NPC_DEPOSIT_MAX_EQUITY_LEVERAGE,
  equityCappedDepositCeiling,
} from "@/lib/banking/rules/balanceSheet";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";

const indexFundReinvestVsDirect: WikiChartBuilder = () => {
  const yieldAnnual = 0.04;
  const perTurnYield = yieldAnnual / TURNS_PER_YEAR;
  let nav = 100;
  let payouts = 0;
  let directCash = 0;
  const unit: [number, number][] = [[0, 100]];
  const fundTotal: [number, number][] = [[0, 100]];
  const direct: [number, number][] = [[0, 100]];
  for (let t = 1; t <= 4 * TURNS_PER_YEAR; t++) {
    const dividend = nav * perTurnYield;
    nav += dividend * INDEX_FUND_DIVIDEND_REINVEST_RATIO;
    payouts += dividend * INDEX_FUND_DIVIDEND_PASS_THROUGH_RATIO;
    directCash += 100 * perTurnYield;
    if (t % 4 === 0) {
      unit.push([t, round(nav, 3)]);
      fundTotal.push([t, round(nav + payouts, 3)]);
      direct.push([t, round(100 + directCash, 3)]);
    }
  }
  return {
    title: "Fund versus holding the shares directly",
    kind: "line",
    xLabel: "Turns",
    yLabel: "Value of 100 invested",
    series: [
      { name: "Fund units (value only)", points: unit },
      { name: "Fund units plus cash paid out", points: fundTotal },
      { name: "Direct holding plus dividends in cash", points: direct },
    ],
    caption:
      "At a 4% dividend yield the fund compounds most of its dividends and pays out the rest. The direct holder keeps every dividend as cash and does not reinvest it.",
  };
};

const indexFundExpenseDrag: WikiChartBuilder = () => {
  const aum0 = 10_000_000;
  const ratios = [MIN_EXPENSE_RATIO_ANNUAL, 0.01, MAX_EXPENSE_RATIO_ANNUAL];
  const series = ratios.map((ratio) => {
    let aum = aum0;
    const points: [number, number][] = [[0, aum]];
    for (let t = 1; t <= 4 * TURNS_PER_YEAR; t++) {
      aum -= expenseFeeForTurn(aum, ratio);
      if (t % 8 === 0) points.push([t, Math.round(aum)]);
    }
    return { name: `Expense ratio ${round(ratio * 100, 2)}% a year`, points };
  });
  return {
    title: "What a sponsor fee costs holders",
    kind: "line",
    xLabel: "Turns",
    yLabel: "Fund value after fees (start 10,000,000)",
    series,
    caption:
      "Before any investment return. The fee comes out of the fund every turn, so it compounds against holders.",
  };
};

const interbankArrearsTimeline: WikiChartBuilder = () => {
  const turns = range(0, ARREARS_DEFAULT_TURNS + 2, 1);
  return {
    title: "Missed interest and write-off",
    kind: "step",
    xLabel: "Consecutive turns of missed interest",
    yLabel: "Loan written off (0 = no, 1 = yes)",
    series: [
      {
        name: "Loan status",
        points: turns.map((t): [number, number] => [t, t >= ARREARS_DEFAULT_TURNS ? 1 : 0]),
      },
    ],
    markers: [{ x: ARREARS_DEFAULT_TURNS, label: "Loan is written off" }],
    caption: "A full interest payment resets the count to zero.",
  };
};

const savingsApyByInflation: WikiChartBuilder = () => {
  const primes = [2, 4, 8, 14];
  const inflations = range(0, 14, 0.5);
  return {
    title: "Savings rate by prime rate and inflation",
    kind: "line",
    xLabel: "Inflation",
    yLabel: "Savings rate (APY)",
    unit: "%",
    series: primes.map((prime) => ({
      name: `Prime ${prime}%`,
      points: inflations.map((i): [number, number] => [i, round(savingsApyPercent(prime, i))]),
    })),
    markers: [{ y: SAVINGS_REAL_RATE_FLOOR_PERCENT / 2, label: "Lowest rate any account earns" }],
    caption:
      "Savings pay half the real prime rate (prime minus inflation), never less than the floor.",
  };
};

const savingsBalanceGrowth: WikiChartBuilder = () => {
  const apy = 1.25;
  let balance = 1_000_000;
  let pending = 0;
  const points: [number, number][] = [[0, balance]];
  for (let t = 1; t <= 4 * TURNS_PER_YEAR; t++) {
    pending += computeSavingsInterestForTurn(balance, apy * 2, "USD", 0);
    if (t % SAVINGS_CREDIT_INTERVAL_TURNS === 0) {
      balance += pending;
      pending = 0;
    }
    points.push([t, Math.round(balance)]);
  }
  return {
    title: "Savings balance with quarterly crediting",
    kind: "step",
    xLabel: "Turns",
    yLabel: "Balance (start 1,000,000)",
    series: [{ name: "Balance at 1.25% APY", points }],
    caption: "Interest builds up every turn but is only credited to the balance once per quarter.",
  };
};

const lineOfCreditRateByScore: WikiChartBuilder = () => {
  const scores = range(0, 100, 5);
  return {
    title: "Line of credit rate by credit score",
    kind: "line",
    xLabel: "Credit score",
    yLabel: "Annual rate",
    unit: "%",
    series: [3, 8].map((prime) => ({
      name: `Prime ${prime}%`,
      points: scores.map((s): [number, number] => [
        s,
        round(prime + spreadPercentPointsFromComposite(s)),
      ]),
    })),
    caption: "A better score cuts the spread you pay above prime.",
  };
};

const lineOfCreditScoreCurves: WikiChartBuilder = () => {
  const millions = range(0, 16, 0.5);
  return {
    title: "Income and net worth score curves",
    kind: "line",
    xLabel: "Annual income or net worth (millions)",
    yLabel: "Score",
    unit: "points",
    series: [
      {
        name: "Income score",
        points: millions
          .filter((m) => m <= 10)
          .map((m): [number, number] => [
            m,
            round(incomeScoreFromPerTurnCurrency((m * 1_000_000) / TURNS_PER_YEAR), 2),
          ]),
      },
      {
        name: "Net worth score",
        points: millions.map((m): [number, number] => [
          m,
          round(netWorthScoreFromInternal(m * 1_000_000), 2),
        ]),
      },
    ],
    caption:
      "Both scores rise quickly at first and flatten near 100, so the first millions matter most.",
  };
};

const lineOfCreditPrimePenalty: WikiChartBuilder = () => {
  const primes = range(0, 12, 0.5);
  const composite = 100;
  return {
    title: "How a high prime rate hurts your score",
    kind: "line",
    xLabel: "Prime rate",
    yLabel: "Score penalty",
    unit: "points",
    series: [0, 50, 100].map((nw) => ({
      name: `Net worth score ${nw}`,
      points: primes.map((p): [number, number] => [
        p,
        round(composite - applyPrimeEnvironmentToComposite(composite, p, nw), 2),
      ]),
    })),
    markers: [{ x: PRIME_STRESS_BASELINE_PERCENT, label: "No penalty at or below this" }],
    caption: "Wealthier borrowers are partly shielded from tight policy.",
  };
};

const depositCeilingVsEquity: WikiChartBuilder = () => {
  const capacityUnits = 100;
  const capacityCeiling = computeDepositCeiling(capacityUnits, DEFAULT_BRANCH_CAPACITY_SHARE);
  const equities = range(0, 10_000_000, 250_000);
  return {
    title: "Deposit ceiling against bank equity",
    kind: "line",
    xLabel: "Bank book equity",
    yLabel: "Deposits the bank may hold",
    series: [
      {
        name: "Allowed deposits (lower of the two)",
        points: equities.map((e): [number, number] => [
          e,
          Math.round(equityCappedDepositCeiling(capacityCeiling, e)),
        ]),
      },
      {
        name: "Equity limit",
        points: equities.map((e): [number, number] => [e, e * NPC_DEPOSIT_MAX_EQUITY_LEVERAGE]),
      },
      {
        name: "Branch capacity limit",
        points: equities.map((e): [number, number] => [e, capacityCeiling]),
      },
    ],
    caption: `Example bank with ${capacityUnits} units of branch capacity at the default share (${DEPOSIT_CEILING_PER_CAPACITY_UNIT.toLocaleString("en-US")} per unit). Below the crossover, equity is the binding limit.`,
  };
};

export const ECONOMY_BANKING_CHARTS: Record<string, WikiChartBuilder> = {
  "index-fund-reinvest-vs-direct": indexFundReinvestVsDirect,
  "index-fund-expense-ratio-drag": indexFundExpenseDrag,
  "interbank-arrears-write-off": interbankArrearsTimeline,
  "savings-apy-by-inflation": savingsApyByInflation,
  "savings-balance-quarterly-credit": savingsBalanceGrowth,
  "line-of-credit-rate-by-score": lineOfCreditRateByScore,
  "line-of-credit-score-curves": lineOfCreditScoreCurves,
  "line-of-credit-prime-penalty": lineOfCreditPrimePenalty,
  "bank-deposit-ceiling-vs-equity": depositCeilingVsEquity,
};
