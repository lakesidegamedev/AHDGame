import type { CrisisTemplate } from "@/lib/db/types/crisis";

export const MARKET_ADJUSTMENT_TEMPLATE_KEY = "market_adjustment";

/**
 * Market Adjustment: the shakeout after the funded market goes live, when a
 * large share of a country's capacity turns out to be overbuilt for what its
 * buyers can pay for. It fires on a measured signal and adds no damage of its
 * own. Margins, output and jobs are whatever the funded market produces; the
 * event exists to name the situation, put the government's real levers in
 * front of it, and carry the political consequences of the measured outcome.
 *
 * Deliberately no `effects`: the old Recession template stacked a margin shock
 * and metric ticks on top of the losses the market already books, and the
 * margin shock does nothing at all on a funded sector.
 */
export const MARKET_ADJUSTMENT_TEMPLATE: CrisisTemplate = {
  name: "Market Adjustment",
  description:
    "Too much capacity was built for what buyers can pay for. Plants across the economy are losing money, and the least viable will close or be retired while demand and prices settle.",
  scope: "country",
  countryIds: [],
  regionIds: [],
  // Ends on its own once the measured signal clears; this is the hard cap.
  durationTurns: 48,
  autoTrigger: {
    kind: "condition",
    cooldownTurns: 96,
    condition: {
      all: [
        // At least four tenths of installed capacity in plants losing money...
        { metric: "lossShare", op: "gt", threshold: 0.4, consecutiveTurns: 3, clearMargin: 0.1 },
        // ...while output is shrinking, not just repricing.
        { metric: "gdpGrowth", op: "lt", threshold: 0, consecutiveTurns: 3, clearMargin: 0.5 },
      ],
    },
  },
  effects: [],
  wireMessageOnStart:
    "Plants across the country are losing money as the economy adjusts to what buyers can pay for. Closures and retirements are expected until capacity matches demand.",
  wireMessageOnEnd: "Most plants are covering their costs again and the adjustment is over.",
  interactionDefinition: {
    autoResolveOnExpiry: true,
    decisionTree: [
      {
        nodeId: "response",
        type: "choice",
        title: "Market adjustment",
        description:
          "A large share of the country's capacity is losing money. The government can leave the adjustment to run or put treasury cash into household spending.",
        requiredRoles: ["headOfState"],
        timeLimitMinutes: null,
        options: [
          {
            optionId: "household_transfer",
            label: "Emergency household transfer",
            description:
              "Pay out 1% of GDP from treasury cash to households. It supports spending and adds to the deficit; it does not shorten the adjustment by itself.",
            effects: [],
            nextNodeId: "resolved",
            treasuryCostPctGdp: 1,
            action: { kind: "financialCrisisResponse", response: "stimulus" },
          },
          {
            optionId: "let_it_run",
            label: "Let the adjustment run",
            description: "Hold spending. Closures and layoffs follow the market.",
            effects: [],
            nextNodeId: "resolved",
          },
        ],
      },
      {
        nodeId: "resolved",
        type: "terminal",
        title: "Response chosen",
        description: "The government has set its response to the adjustment.",
        requiredRoles: ["headOfState"],
        timeLimitMinutes: null,
        outcomeEffects: [],
        outcomeMessage: "The government has chosen its response.",
      },
    ],
  },
};

export const MARKET_ADJUSTMENT_CRISIS_TEMPLATES: Record<string, CrisisTemplate> = {
  [MARKET_ADJUSTMENT_TEMPLATE_KEY]: MARKET_ADJUSTMENT_TEMPLATE,
};
