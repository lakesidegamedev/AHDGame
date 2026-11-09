/**
 * The automation policy track of the later-era law book: the laws that decide
 * who carries the cost when machines take over work. Beside the automation tax
 * and wage insurance (2030) and the basic income pilot (2035), this adds a
 * retraining guarantee and a hiring subsidy (2030), and an automation pension
 * levy and transition compacts (2035). Split from modernEraLaws.ts to keep that
 * file under its size pin; the specs share its shape and are built there.
 *
 * Beyond the metric board and the budget, these laws reach the economy through
 * the rules in `@/lib/automationPolicy`: how many crew automated plants keep,
 * what automation and labour cost firms, how fast displaced workers find new
 * work, how strong unions are, and which voters approve. The numbers there are
 * deliberately small.
 */

import type { ModernLawSpec } from "./modernEraLaws";

export const AUTOMATION_BAND_SPECS: readonly ModernLawSpec[] = [
  // ── 2030 ────────────────────────────────────────────────────────────────
  {
    slug: "retrainingGuarantee",
    from: 2030,
    category: "education",
    targets: [
      { metricId: "education.adultSkills", weight: 0.45 },
      { metricId: "economy.mobility", weight: 0.3 },
      { metricId: "economy.fiscal", weight: -0.25 },
    ],
    title: {
      US: "Workforce Retraining Act",
      UK: "Lifelong Skills Guarantee Act",
    },
    description: {
      US: "Pays for adults to retrain when their work is automated away. Displaced workers find new jobs sooner and skills improve; taxpayers pay.",
      UK: "Pays for adults to retrain when their work is automated away. Displaced workers find new jobs sooner and skills improve; taxpayers pay.",
    },
    noStatute:
      "A worker whose job is automated away pays for any retraining out of their own pocket.",
    levels: [
      {
        name: "Training Vouchers",
        description: "Displaced workers get a small voucher towards an approved course.",
        cost: 0.0004,
      },
      {
        name: "Sector Skills Funds",
        description:
          "Industries that automate pay into funds that train their own displaced workers, matched by the state.",
        cost: 0.001,
      },
      {
        name: "Paid Retraining Leave",
        description:
          "A displaced worker is entitled to a year of paid, supported retraining before any benefit is cut.",
        cost: 0.002,
      },
      {
        name: "Lifelong Learning Account",
        description:
          "Every adult has a state-funded learning account to draw on at any age, topped up when their job is automated.",
        cost: 0.0032,
      },
    ],
  },
  {
    slug: "hiringSubsidy",
    from: 2030,
    category: "economy",
    targets: [
      { metricId: "economy.workerSecurity", weight: 0.4 },
      { metricId: "economy.householdIncome", weight: 0.3 },
      { metricId: "economy.fiscal", weight: -0.25 },
    ],
    title: {
      US: "Employment Subsidy Act",
      UK: "Jobs Retention Subsidy Act",
    },
    description: {
      US: "Pays part of the wage bill of firms that keep or hire workers instead of replacing them with machines. Workers and wages gain and firms keep more crew; taxpayers pay.",
      UK: "Pays part of the wage bill of firms that keep or hire workers instead of replacing them with machines. Workers and wages gain and firms keep more crew; taxpayers pay.",
    },
    noStatute: "Firms carry the whole wage bill of every worker they keep.",
    levels: [
      {
        name: "Targeted Hiring Credit",
        description: "Firms get a small credit for hiring a worker who lost a job to automation.",
        cost: 0.0006,
      },
      {
        name: "Low Wage Top-Up",
        description: "The state pays a share of the wage bill for low paid jobs.",
        cost: 0.0015,
      },
      {
        name: "Employment Retention Subsidy",
        description:
          "Firms that keep staff on while they automate get a share of those wages paid by the state.",
        cost: 0.0028,
      },
      {
        name: "Broad Wage Subsidy",
        description:
          "The state pays a large share of the wage bill of every firm that keeps its workforce.",
        cost: 0.0045,
      },
    ],
  },
  // ── 2035 ────────────────────────────────────────────────────────────────
  {
    slug: "automationPensionLevy",
    from: 2035,
    category: "economy",
    budgetKeyOverride: { US: "socialSecurity", UK: "statePensions" },
    targets: [
      { metricId: "health.socialInsurance", weight: 0.4 },
      { metricId: "economy.stability", weight: 0.3 },
      { metricId: "economy.productivity", weight: -0.3 },
    ],
    title: {
      US: "Automation Pension Contribution Act",
      UK: "Automation Pension Contribution Act",
    },
    description: {
      US: "Makes firms that automate pay a contribution into the retirement system to replace the payroll contributions their lost jobs would have made. The pension fund gains and the budget saves on pensions; firms that automate pay.",
      UK: "Makes firms that automate pay a contribution into the State Pension to replace the National Insurance their lost jobs would have made. The pension fund gains and the budget saves on pensions; firms that automate pay.",
    },
    noStatute:
      "Pensions are funded from the contributions of people in work, however many jobs are automated.",
    levels: [
      // A negative cost is a saving on the pension line: the levy pays for
      // part of the pension bill that the budget would otherwise carry.
      {
        name: "Voluntary Contribution Scheme",
        description:
          "Firms that automate may pay into the pension system in return for a small tax relief.",
        cost: -0.0004,
      },
      {
        name: "Displaced Payroll Contribution",
        description:
          "Firms pay into the pension system a share of the contributions that each automated job would have made.",
        cost: -0.001,
      },
      {
        name: "Full Contribution Replacement",
        description: "Firms pay the full pension contribution for every job a machine replaces.",
        cost: -0.0018,
      },
      {
        name: "Automation Pension Fund",
        description:
          "A levy on automated output feeds a national pension fund that pays a top-up to every pensioner.",
        cost: -0.0028,
      },
    ],
  },
  {
    slug: "transitionCompacts",
    from: 2035,
    category: "economy",
    targets: [
      { metricId: "economy.workerSecurity", weight: 0.45 },
      { metricId: "economy.householdIncome", weight: 0.3 },
      { metricId: "economy.competition", weight: -0.3 },
    ],
    title: {
      US: "Labor Transition Compacts Act",
      UK: "Labour Transition Compacts Act",
    },
    description: {
      US: "Gives unions a seat at the table whenever a firm plans to automate, and lets whole industries bargain over how the change is shared. Unions and workers gain; firms lose some freedom to restructure.",
      UK: "Gives unions a seat at the table whenever a firm plans to automate, and lets whole industries bargain over how the change is shared. Unions and workers gain; firms lose some freedom to restructure.",
    },
    noStatute: "Firms decide alone how and when to automate, and unions have no say in it.",
    levels: [
      {
        name: "Consultation Duty",
        description: "Firms must tell unions about automation plans well before they act.",
        cost: 0.00005,
      },
      {
        name: "Joint Transition Councils",
        description:
          "Large firms set up councils with their unions to agree timing, retraining and redeployment.",
        cost: 0.0001,
      },
      {
        name: "Sector Bargaining Rights",
        description:
          "Unions and employers in each industry bargain together over how automation gains are shared.",
        cost: 0.00018,
      },
      {
        name: "Binding Transition Compacts",
        description:
          "Automation in an industry may go ahead only under a compact agreed with its unions.",
        cost: 0.0003,
      },
    ],
  },
];
