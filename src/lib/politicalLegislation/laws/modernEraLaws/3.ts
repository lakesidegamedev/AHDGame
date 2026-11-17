import type { ModernLawSpec } from "@/lib/politicalLegislation/laws/modernEraLaws";

export const EARLIER_BAND_SPECS_3: readonly ModernLawSpec[] = [
  // ── 2040 ────────────────────────────────────────────────────────────────
  {
    slug: "automationDividend",
    from: 2040,
    category: "economy",
    budgetKeyOverride: { US: "socialSecurity", UK: "welfare" },
    targets: [
      { metricId: "economy.householdIncome", weight: 0.45 },
      { metricId: "society.socialMobility", weight: 0.3 },
      { metricId: "economy.productivity", weight: -0.3 },
    ],
    title: {
      US: "Automation Dividend Act",
      UK: "Automation Dividend Act",
    },
    description: {
      US: "Taxes the output of machines and software and pays it back to every resident as a yearly dividend. Households gain a share of automated wealth; the firms that automate pay.",
      UK: "Taxes the output of machines and software and pays it back to every resident as a yearly dividend. Households gain a share of automated wealth; the firms that automate pay.",
    },
    noStatute: "The gains from automation go to the firms that own the machines.",
    levels: [
      {
        name: "Token Dividend",
        description: "A small levy on automated output is paid out as an annual dividend.",
        cost: 0.0021,
        revenue: 0.002,
      },
      {
        name: "Shared Gains Dividend",
        description: "A larger levy funds a dividend worth a few weeks of wages each year.",
        cost: 0.0052,
        revenue: 0.005,
      },
      {
        name: "Citizens Share",
        description:
          "Every resident holds a share in a national automation fund that pays a dividend every quarter.",
        cost: 0.0103,
        revenue: 0.01,
      },
      {
        name: "Full Automation Dividend",
        description:
          "A heavy levy on automated output pays a dividend large enough to live on for many households.",
        cost: 0.0155,
        revenue: 0.015,
      },
    ],
  },

  {
    slug: "fourDayWeek",
    from: 2040,
    category: "economy",
    targets: [
      { metricId: "society.familyStability", weight: 0.4 },
      { metricId: "health.prevention", weight: 0.3 },
      { metricId: "economy.productivity", weight: -0.3 },
    ],
    title: {
      US: "Four-Day Work Week Act",
      UK: "Four-Day Working Week Act",
    },
    description: {
      US: "Shortens the standard working week to four days without a cut in pay. Workers and families gain time; employers pay for the lost hours.",
      UK: "Shortens the standard working week to four days without a cut in pay. Workers and families gain time; employers pay for the lost hours.",
    },
    noStatute: "The working week is whatever employers and workers agree.",
    levels: [
      {
        name: "Right to Request",
        description:
          "Workers may ask for a four-day week, and employers must give a reason to refuse.",
        cost: 0.0001,
      },
      {
        name: "Public Sector Trial",
        description:
          "Government departments move to a four-day week and report on output and wellbeing.",
        cost: 0.0004,
      },
      {
        name: "Thirty-Two Hour Standard",
        description:
          "Overtime pay starts after thirty-two hours a week, so most employers move to four days.",
        cost: 0.0008,
      },
      {
        name: "Four-Day Week Mandate",
        description:
          "A four-day week on full pay is the legal standard for every employer, enforced by inspectors.",
        cost: 0.0015,
      },
    ],
  },

  {
    slug: "digitalCurrencyLegalTender",
    from: 2040,
    category: "economy",
    targets: [
      { metricId: "economy.stability", weight: 0.4 },
      { metricId: "economy.competition", weight: 0.3 },
      { metricId: "order.dueProcess", weight: -0.3 },
    ],
    title: {
      US: "Digital Dollar Act",
      UK: "Digital Pound Act",
    },
    description: {
      US: "Makes a central bank digital dollar legal tender alongside cash. Payments get cheaper and safer; privacy and the banks that hold deposits pay.",
      UK: "Makes a Bank of England digital pound legal tender alongside cash. Payments get cheaper and safer; privacy and the banks that hold deposits pay.",
    },
    noStatute: "Money is cash and bank deposits. The central bank issues no digital currency.",
    levels: [
      {
        name: "Wholesale Digital Money",
        description: "Banks settle payments with each other in central bank digital money.",
        cost: 0.0001,
      },
      {
        name: "Retail Pilot",
        description:
          "Households may hold a capped amount of digital currency in a central bank wallet.",
        cost: 0.0002,
      },
      {
        name: "Legal Tender",
        description:
          "Digital currency is legal tender: every shop must accept it, and the state earns a margin on issuing it.",
        cost: 0.0004,
        revenue: 0.0005,
      },
      {
        name: "Cashless Transition",
        description:
          "Digital currency becomes the main form of money, cash is phased out and every payment leaves a record.",
        cost: 0.0006,
        revenue: 0.001,
      },
    ],
  },

  {
    slug: "sovereignWealthFundMandate",
    from: 2040,
    category: "economy",
    targets: [
      { metricId: "economy.stability", weight: 0.4 },
      { metricId: "economy.fiscal", weight: 0.3 },
      { metricId: "economy.competition", weight: -0.25 },
    ],
    title: {
      US: "American Sovereign Wealth Fund Act",
      UK: "National Wealth Fund Act",
    },
    description: {
      US: "Sets up a national investment fund, paid into from the budget, that owns stakes in firms at home and abroad. Future budgets gain its returns; taxpayers pay in today and private investors face a state rival.",
      UK: "Sets up a national investment fund, paid into from the budget, that owns stakes in firms at home and abroad. Future budgets gain its returns; taxpayers pay in today and private investors face a state rival.",
    },
    noStatute: "The state owns no investment fund, and surpluses go to paying down debt.",
    levels: [
      {
        name: "Seed Fund",
        description: "A small fund invests windfall revenue and reports its returns each year.",
        cost: 0.002,
        revenue: 0.0005,
      },
      {
        name: "Strategic Investment Mandate",
        description:
          "The fund is paid into every year and backs domestic industries the state judges strategic.",
        cost: 0.005,
        revenue: 0.0015,
      },
      {
        name: "Global Portfolio Fund",
        description:
          "A large fund invests worldwide under an independent board, with its returns paid into the budget.",
        cost: 0.01,
        revenue: 0.0035,
      },
      {
        name: "National Ownership Fund",
        description:
          "The fund takes large stakes in major companies and pays a share of its returns into the budget.",
        cost: 0.015,
        revenue: 0.006,
      },
    ],
  },
];
