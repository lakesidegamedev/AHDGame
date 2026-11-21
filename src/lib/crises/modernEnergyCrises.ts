import type {
  CrisisAutoTrigger,
  CrisisDecisionOption,
  CrisisEffect,
  CrisisTemplate,
} from "@/lib/db/types/crisis";
import { fx, marginShock } from "@/lib/crises/templateHelpers";

/**
 * Crisis templates for the 2027 to 2050 world. Each one carries a `fromYear` and
 * an `untilYear` so the theme opens when it becomes apt and retires when the
 * world has moved on from it. Every template follows one shape: a response
 * choice, a funded collective node, then a terminal outcome. Nothing here is
 * scheduled: each one is a low per-turn roll with a cooldown, so a country can
 * go years without seeing any of them.
 */

export const HERO = {
  heat: "https://images.unsplash.com/photo-1563630381190-77c336ea545a?auto=format&fit=crop&w=1600&q=70",
  fire: "https://images.unsplash.com/photo-1692364221415-654b20e6d1d2?auto=format&fit=crop&w=1600&q=70",
  drought:
    "https://images.unsplash.com/photo-1753542175735-f57082a5ff79?auto=format&fit=crop&w=1600&q=70",
  housing:
    "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1600&q=70",
  bank: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1600&q=70",
  tech: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=70",
  industry:
    "https://images.unsplash.com/photo-1676624775964-10bc144cbeba?auto=format&fit=crop&w=1600&q=70",
  port: "https://images.unsplash.com/photo-1605745341112-85968b19335b?auto=format&fit=crop&w=1600&q=70",
  grid: "https://images.unsplash.com/photo-1611416457332-946853cc75d6?auto=format&fit=crop&w=1600&q=70",
  water:
    "https://images.unsplash.com/photo-1769298315896-fc23a5dcbff8?auto=format&fit=crop&w=1600&q=70",
  cyber:
    "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1600&q=70",
  info: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1600&q=70",
  tide: "https://images.unsplash.com/photo-1657069344312-a500de53b566?auto=format&fit=crop&w=1600&q=70",
  labor:
    "https://images.unsplash.com/photo-1511898634545-c01af8a54dd5?auto=format&fit=crop&w=1600&q=70",
} as const;

export interface ModernOption {
  id: string;
  label: string;
  description: string;
  effects: CrisisEffect[];
  /** Turns cut from the crisis when chosen. Only set where the copy promises it. */
  cutsTurns?: number;
}

export interface ModernCrisisSpec {
  name: string;
  heroImage: string;
  description: string;
  scope?: "country" | "global";
  durationTurns: number;
  fromYear: number;
  untilYear: number;
  trigger: CrisisAutoTrigger;
  effects: CrisisEffect[];
  wireStart: string;
  wireEnd: string;
  prompt: { title: string; description: string };
  options: [ModernOption, ModernOption, ModernOption];
  fund: { title: string; description: string; target: number };
  outcome: { message: string; effects: CrisisEffect[] };
}

export function option(o: ModernOption): CrisisDecisionOption {
  return {
    optionId: o.id,
    label: o.label,
    description: o.description,
    nextNodeId: "fund",
    effects: o.effects,
    ...(o.cutsTurns ? { durationReductionTurns: o.cutsTurns } : {}),
  };
}

export function random(
  cooldownTurns: number,
  spawnChance: number,
  scope: "country" | "global" = "country"
): CrisisAutoTrigger {
  return { kind: "random", cooldownTurns, scope, spawnChance };
}

export function modernCrisis(spec: ModernCrisisSpec): CrisisTemplate {
  const scope = spec.scope ?? "country";
  return {
    name: spec.name,
    heroImage: spec.heroImage,
    description: spec.description,
    fromYear: spec.fromYear,
    untilYear: spec.untilYear,
    autoTrigger: spec.trigger,
    scope,
    countryIds: [],
    regionIds: [],
    durationTurns: spec.durationTurns,
    durationByScope: { country: spec.durationTurns, global: spec.durationTurns + 2 },
    effects: spec.effects,
    wireMessageOnStart: spec.wireStart,
    wireMessageOnEnd: spec.wireEnd,
    interactionDefinition: {
      decisionTree: [
        {
          nodeId: "response",
          type: "choice",
          title: spec.prompt.title,
          description: spec.prompt.description,
          requiredRoles: ["headOfState"],
          timeLimitMinutes: null,
          options: spec.options.map(option),
        },
        {
          nodeId: "fund",
          type: "collective",
          title: spec.fund.title,
          description: spec.fund.description,
          collectiveTarget: spec.fund.target,
          collectiveCurrency: "USD",
          requiredRoles: ["headOfState", "cabinet"],
          timeLimitMinutes: 1440,
          options: [
            {
              optionId: "contribute_10m",
              label: "Contribute $10M",
              description: "Commit $10M to the recovery fund.",
              collectiveContribution: 10_000_000,
              nextNodeId: "terminal",
              effects: [],
            },
            {
              optionId: "contribute_5m",
              label: "Contribute $5M",
              description: "Commit $5M to the recovery fund.",
              collectiveContribution: 5_000_000,
              nextNodeId: "terminal",
              effects: [],
            },
            {
              optionId: "decline",
              label: "Decline",
              description: "No contribution.",
              collectiveContribution: 0,
              nextNodeId: "terminal",
              effects: [],
            },
          ],
        },
        {
          nodeId: "terminal",
          type: "terminal",
          title: "Recovery underway",
          description: "The response is set.",
          outcomeMessage: spec.outcome.message,
          outcomeEffects: spec.outcome.effects,
          requiredRoles: ["any"],
          timeLimitMinutes: null,
        },
      ],
      autoResolveOnExpiry: true,
    },
  };
}

export const SOLAR_STORM = modernCrisis({
  name: "Severe Solar Storm",
  heroImage: HERO.grid,
  description:
    "The strongest geomagnetic storm in generations is sending currents through long power lines and transformers. Satellites are tumbling, navigation is failing and sections of the grid are tripping offline. Over about 4 turns grid reliability drops sharply, satellite and navigation outages hold back growth and cut margins, and the public is alarmed.",
  scope: "global",
  durationTurns: 4,
  fromYear: 2027,
  untilYear: 2050,
  trigger: random(432, 0.0006, "global"),
  effects: [
    fx(
      "tick",
      "metric",
      "infrastructure",
      "power",
      -0.04,
      "Transformers tripped by induced current"
    ),
    fx("tick", "metric", "economy", "gdp", -0.01, "Satellite and navigation outages"),
    marginShock(-3, "Power and logistics disruption", "financial"),
    fx("tick", "approval", "government", "overall", -0.015, "Public alarm"),
  ],
  wireStart: "A severe solar storm is hitting Earth. Power grids and satellites are failing.",
  wireEnd: "The storm has passed. Crews are restoring power and replacing satellites.",
  prompt: {
    title: "Solar storm response",
    description:
      "Grid operators ask for emergency powers to protect the system. What do you order?",
  },
  options: [
    {
      id: "protect_grid",
      label: "Order precautionary shutdowns",
      description:
        "Disconnect vulnerable lines and transformers before the surge. A planned outage now to avoid months of repairs, and it shortens the crisis.",
      effects: [
        fx("flat", "metric", "infrastructure", "power", 0.03, "Transformers saved"),
        fx("flat", "metric", "economy", "gdp", -0.004, "Planned outage cost"),
      ],
      cutsTurns: 1,
    },
    {
      id: "spare_stock",
      label: "Release the national spare transformer stock",
      description: "Swap damaged units from the strategic reserve and restore service fast.",
      effects: [
        fx("flat", "metric", "infrastructure", "power", 0.025, "Spares speed restoration"),
        fx("flat", "metric", "infrastructure", "damage", -0.01, "Reserve drawn down"),
      ],
    },
    {
      id: "wait_and_see",
      label: "Wait for operators to assess damage",
      description: "Leave decisions to the grid operators and the weather service.",
      effects: [fx("flat", "approval", "government", "overall", -0.02, "Seen as unprepared")],
    },
  ],
  fund: {
    title: "Space weather resilience fund",
    description:
      "Governments may pool money for hardened transformers and satellite replacement. Full funding speeds recovery.",
    target: 25_000_000,
  },
  outcome: {
    message:
      "Power is back and damaged satellites are being replaced. A space weather protection standard is now in force for new grid equipment.",
    effects: [
      fx("flat", "metric", "infrastructure", "power", 0.03, "Hardened equipment standard"),
      fx("flat", "metric", "publicsafety", "confidence", 0.02, "Forecasting improved"),
    ],
  },
});

export const TECH_LENDER_RUN = modernCrisis({
  name: "Run on a Tech Lender",
  heroImage: HERO.bank,
  description:
    "A bank that lends to start-ups and holds long bonds lost its depositors in a single weekend. Companies cannot meet payroll and investors fear similar lenders are next. For about 5 turns investor confidence falls, new business formation stalls as credit to start-ups freezes, lenders lose margin and approval slips on talk of a rescue.",
  durationTurns: 5,
  fromYear: 2027,
  untilYear: 2038,
  trigger: random(216, 0.0028),
  effects: [
    fx("tick", "metric", "economy", "investorConfidence", -0.035, "Contagion fear"),
    fx(
      "tick",
      "metric",
      "economic",
      "smallBusinessFormation",
      -0.02,
      "Credit to start-ups freezes"
    ),
    marginShock(-5, "Tech lender losses", "financial", "financial"),
    fx("tick", "approval", "government", "overall", -0.02, "Public anger at bank rescue talk"),
  ],
  wireStart:
    "Depositors are pulling their money out of a major tech lender. Regulators are meeting.",
  wireEnd: "The lender is resolved and deposits are safe. Market fear is easing.",
  prompt: {
    title: "Tech lender resolution",
    description: "Hours remain before Monday's open. Do you guarantee deposits or let losses fall?",
  },
  options: [
    {
      id: "guarantee_deposits",
      label: "Guarantee all deposits",
      description:
        "Stop the run by guaranteeing every deposit and shortening the crisis. Taxpayers carry some risk and critics cry moral hazard.",
      effects: [
        fx("flat", "metric", "economy", "investorConfidence", 0.04, "Run halted"),
        fx("flat", "approval", "government", "overall", -0.015, "Bailout criticism"),
      ],
      cutsTurns: 2,
    },
    {
      id: "bridge_bank",
      label: "Seize the lender and sell it to a rival",
      description:
        "Resolve the bank over a weekend, wiping out shareholders and protecting insured deposits.",
      effects: [
        fx("flat", "metric", "economy", "investorConfidence", 0.02, "Orderly resolution"),
        fx("flat", "metric", "economic", "smallBusinessFormation", -0.01, "Lender franchise lost"),
      ],
    },
    {
      id: "let_fail",
      label: "Let uninsured depositors take losses",
      description: "Hold the line on moral hazard. The panic spreads to the next weakest lender.",
      effects: [
        fx("flat", "metric", "economy", "investorConfidence", -0.03, "Panic spreads"),
        fx("flat", "approval", "government", "overall", -0.02, "Founders lose their payroll"),
      ],
    },
  ],
  fund: {
    title: "Deposit stabilization fund",
    description:
      "Governments may pool money to backstop sound lenders. Full funding speeds recovery.",
    target: 25_000_000,
  },
  outcome: {
    message:
      "Deposits are safe and the run has ended. Regulators are tightening liquidity rules for lenders with concentrated books.",
    effects: [
      fx("flat", "metric", "economy", "investorConfidence", 0.02, "Rules tightened"),
      fx("flat", "metric", "economic", "smallBusinessFormation", 0.01, "Credit returns"),
    ],
  },
});

export const AI_MODEL_FAILURE = modernCrisis({
  name: "AI Model Failure Scandal",
  heroImage: HERO.info,
  description:
    "An AI system used widely in benefits, lending and hiring has been making flawed decisions for months. Thousands of people were wrongly turned down, and no one can say who is responsible. For about 5 turns public trust in automated decisions falls, investors worry about liability and approval drops with each case that comes out.",
  durationTurns: 5,
  fromYear: 2027,
  untilYear: 2044,
  trigger: random(216, 0.003),
  effects: [
    fx(
      "tick",
      "metric",
      "economy",
      "consumerConfidence",
      -0.012,
      "Public trust in automated decisions"
    ),
    fx("tick", "metric", "economy", "investorConfidence", -0.01, "Liability uncertainty"),
    fx("tick", "approval", "government", "overall", -0.03, "Anger at the wrongful refusals"),
  ],
  wireStart: "A widely used AI system is found to have wrongly refused thousands of claims.",
  wireEnd: "Affected people are being compensated and the system has been withdrawn.",
  prompt: {
    title: "Automated decision failure",
    description: "Victims want answers and the vendor says the system worked as designed.",
  },
  options: [
    {
      id: "audit_mandate",
      label: "Mandate audits and human appeal for automated decisions",
      description:
        "Require independent audits, logging and a human appeal route. Slows deployment and shortens the scandal.",
      effects: [
        fx("flat", "metric", "economy", "consumerConfidence", 0.02, "Trust partly restored"),
        fx(
          "flat",
          "metric",
          "economy",
          "investorConfidence",
          -0.008,
          "Compliance costs for AI firms"
        ),
      ],
      cutsTurns: 1,
    },
    {
      id: "compensation_fund",
      label: "Compensate the victims at public cost",
      description:
        "Pay back wrongly refused claims at once and seek recovery from the vendor later.",
      effects: [
        fx("flat", "approval", "government", "overall", 0.02, "Victims made whole"),
        fx("flat", "metric", "economy", "gdp", -0.003, "Compensation cost"),
      ],
    },
    {
      id: "blame_vendor",
      label: "Blame the vendor and change nothing",
      description:
        "Cancel the contract and issue a statement. The next system will fail the same way.",
      effects: [fx("flat", "approval", "government", "overall", -0.025, "Seen as evasive")],
    },
  ],
  fund: {
    title: "Algorithmic redress fund",
    description:
      "Governments may pool money for independent audit capacity and redress. Full funding speeds recovery.",
    target: 12_000_000,
  },
  outcome: {
    message:
      "An audit regime is operating and appeals are being heard by people. Vendors now carry liability for automated decisions.",
    effects: [
      fx("flat", "metric", "economy", "consumerConfidence", 0.015, "Appeal route in place"),
      fx("flat", "metric", "economic", "smallBusinessFormation", 0.005, "Clear rules for builders"),
    ],
  },
});
