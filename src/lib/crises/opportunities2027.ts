import type {
  CrisisAutoTrigger,
  CrisisDecisionOption,
  CrisisEffect,
  CrisisTemplate,
} from "@/lib/db/types/crisis";
import { fx } from "@/lib/crises/templateHelpers";

/**
 * Opportunities for the 2027 world: trade offers, tax and climate accords,
 * shared science projects, hosting bids and cultural moments. They ride the
 * crisis machinery (a decision, a funded node, an outcome) but carry
 * `opportunity: true`, so they never count toward the severe-crisis stacking
 * limit and are never deferred by it.
 *
 * Every offer has a price. The two ways of taking it up cost output,
 * confidence or approval up front, and only those paths reach the payoff. The
 * fallback is `decline`, which costs nothing and gains nothing, so an offer
 * nobody answers simply lapses.
 *
 * Nothing here is scheduled: each is a low per-turn roll with a long cooldown.
 */

const HERO = {
  trade:
    "https://images.unsplash.com/photo-1605745341112-85968b19335b?auto=format&fit=crop&w=1600&q=70",
  tax: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1600&q=70",
  climate:
    "https://images.unsplash.com/photo-1611416457332-946853cc75d6?auto=format&fit=crop&w=1600&q=70",
  science:
    "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=70",
  stadium:
    "https://images.unsplash.com/photo-1511898634545-c01af8a54dd5?auto=format&fit=crop&w=1600&q=70",
  culture:
    "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1600&q=70",
} as const;

interface OpportunityOption {
  id: string;
  label: string;
  description: string;
  /** The price of taking this path. Must hold at least one cost. */
  effects: CrisisEffect[];
}

interface OpportunitySpec {
  name: string;
  heroImage: string;
  description: string;
  durationTurns: number;
  fromYear: number;
  /** Absent means the theme stays current after 2050. */
  untilYear?: number;
  trigger: CrisisAutoTrigger;
  wireStart: string;
  wireEnd: string;
  prompt: { title: string; description: string };
  /** Two ways of taking the offer up, each with a cost. */
  accept: [OpportunityOption, OpportunityOption];
  decline: { label: string; description: string };
  fund: { title: string; description: string; target: number };
  outcome: { message: string; effects: CrisisEffect[] };
}

/** Unanswered offers lapse after a day of play. */
const OFFER_WINDOW_MINUTES = 1440;

function random(cooldownTurns: number, spawnChance: number): CrisisAutoTrigger {
  return { kind: "random", cooldownTurns, scope: "country", spawnChance };
}

function acceptOption(o: OpportunityOption): CrisisDecisionOption {
  return {
    optionId: o.id,
    label: o.label,
    description: o.description,
    nextNodeId: "fund",
    effects: o.effects,
  };
}

function opportunity(spec: OpportunitySpec): CrisisTemplate {
  return {
    name: spec.name,
    heroImage: spec.heroImage,
    description: spec.description,
    opportunity: true,
    fromYear: spec.fromYear,
    ...(spec.untilYear !== undefined ? { untilYear: spec.untilYear } : {}),
    autoTrigger: spec.trigger,
    scope: "country",
    countryIds: [],
    regionIds: [],
    durationTurns: spec.durationTurns,
    durationByScope: { country: spec.durationTurns },
    effects: [],
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
          timeLimitMinutes: OFFER_WINDOW_MINUTES,
          options: [
            ...spec.accept.map(acceptOption),
            {
              optionId: "decline",
              label: spec.decline.label,
              description: spec.decline.description,
              nextNodeId: "declined",
              effects: [],
            },
          ],
        },
        {
          nodeId: "fund",
          type: "collective",
          title: spec.fund.title,
          description: spec.fund.description,
          collectiveTarget: spec.fund.target,
          collectiveCurrency: "USD",
          requiredRoles: ["headOfState", "cabinet"],
          timeLimitMinutes: OFFER_WINDOW_MINUTES,
          options: [
            {
              optionId: "contribute_10m",
              label: "Contribute $10M",
              description: "Commit $10M to the national stake.",
              collectiveContribution: 10_000_000,
              nextNodeId: "terminal",
              effects: [],
            },
            {
              optionId: "contribute_5m",
              label: "Contribute $5M",
              description: "Commit $5M to the national stake.",
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
          title: "Commitment made",
          description: "The country has taken up the offer.",
          outcomeMessage: spec.outcome.message,
          outcomeEffects: spec.outcome.effects,
          requiredRoles: ["any"],
          timeLimitMinutes: null,
        },
        {
          nodeId: "declined",
          type: "terminal",
          title: "Offer passed up",
          description: "The country has let the offer go.",
          outcomeMessage:
            "The government let the offer lapse. Nothing was spent and nothing gained.",
          outcomeEffects: [],
          requiredRoles: ["any"],
          timeLimitMinutes: null,
        },
      ],
      autoResolveOnExpiry: true,
    },
  };
}

// ── TRADE AND TAX ──────────────────────────────────────────────────────────

const TRADE_DEAL_OFFER = opportunity({
  name: "Bilateral Trade Deal Offer",
  heroImage: HERO.trade,
  description:
    "A major trading partner offers a bilateral deal: lower tariffs on both sides, mutual recognition of standards and a faster customs lane. The price is opening protected domestic markets to its exporters.",
  durationTurns: 6,
  fromYear: 2027,
  trigger: random(192, 0.003),
  wireStart: "A trading partner has tabled a bilateral trade deal. Negotiators are standing by.",
  wireEnd: "The trade talks have closed.",
  prompt: {
    title: "Trade deal offer",
    description:
      "Exporters want the deal signed. Producers facing new competition want it blocked. What does the government do?",
  },
  accept: [
    {
      id: "sign_with_concessions",
      label: "Sign quickly and open protected markets",
      description:
        "Take the deal as offered. Exporters win at once, but protected producers lose orders and some workers lose jobs.",
      effects: [
        fx("flat", "metric", "economy", "unemployment", 0.006, "Protected producers shed jobs"),
        fx("flat", "approval", "workers", "overall", -0.03, "Unions oppose the concessions"),
      ],
    },
    {
      id: "negotiate_safeguards",
      label: "Hold out for safeguards",
      description:
        "Keep negotiating for transition periods and quotas. Fewer losers, but months of talks unsettle investors and the final deal is smaller.",
      effects: [
        fx("flat", "metric", "economy", "investorConfidence", -0.015, "Talks drag on"),
        fx("flat", "metric", "economy", "gdp", -0.002, "Orders held back during talks"),
      ],
    },
  ],
  decline: {
    label: "Turn the deal down",
    description: "Keep current tariffs. No losers at home, and no new markets abroad.",
  },
  fund: {
    title: "Export readiness fund",
    description:
      "Money for customs systems, export credit and help for firms entering the new market. Fuller funding means a faster start.",
    target: 15_000_000,
  },
  outcome: {
    message:
      "The deal is in force. Exporters are shipping into the new market and customs queues have shortened.",
    effects: [
      fx("flat", "metric", "economy", "exports", 0.04, "New market opened"),
      fx("flat", "metric", "economy", "gdp", 0.006, "Export orders rise"),
      fx("flat", "metric", "economy", "investorConfidence", 0.02, "Market access secured"),
    ],
  },
});

const MINIMUM_TAX_ACCORD = opportunity({
  name: "Global Minimum Tax Accord",
  heroImage: HERO.tax,
  description:
    "A coalition of governments invites the country into a binding minimum tax on large multinationals. Signing ends the race to the bottom and brings in revenue, but the firms that relied on low rates will not thank the government for it.",
  durationTurns: 5,
  fromYear: 2027,
  untilYear: 2040,
  trigger: random(240, 0.0025),
  wireStart: "The minimum tax coalition has invited the country to sign its accord.",
  wireEnd: "The minimum tax signing window has closed.",
  prompt: {
    title: "Minimum tax accord",
    description:
      "Signing closes loopholes and raises revenue. Large firms warn they will invest elsewhere. What does the government do?",
  },
  accept: [
    {
      id: "sign_and_enforce",
      label: "Sign and enforce in full",
      description:
        "Adopt the full minimum rate and close the local loopholes. The largest revenue gain, and the sharpest reaction from business.",
      effects: [
        fx("flat", "metric", "economy", "investorConfidence", -0.03, "Multinationals reprice"),
        fx("flat", "approval", "business", "overall", -0.04, "Business lobby opposes the accord"),
      ],
    },
    {
      id: "sign_with_carveouts",
      label: "Sign with carve-outs",
      description:
        "Sign, but keep credits for research and regional investment. Less revenue, a milder reaction and some criticism for watering it down.",
      effects: [
        fx("flat", "metric", "economy", "investorConfidence", -0.012, "Firms reprice the change"),
        fx("flat", "approval", "reformers", "overall", -0.02, "Seen as a half measure"),
      ],
    },
  ],
  decline: {
    label: "Stay out",
    description: "Keep the low rates. Firms stay put and the revenue stays offshore.",
  },
  fund: {
    title: "Tax enforcement build-out",
    description:
      "Money for auditors and data sharing with the other signatories. Fuller funding brings the revenue in faster.",
    target: 10_000_000,
  },
  outcome: {
    message:
      "The accord is in force. Revenue from large firms is up and the money is funding public services.",
    effects: [
      fx("flat", "metric", "economy", "consumerConfidence", 0.02, "Public services funded"),
      fx("flat", "metric", "publicsafety", "confidence", 0.02, "Services visibly improve"),
      fx("flat", "approval", "government", "overall", 0.02, "Big firms pay their share"),
    ],
  },
});

// ── CLIMATE AND SCIENCE ────────────────────────────────────────────────────

const CLIMATE_FINANCE_PACT = opportunity({
  name: "Climate Finance Pact Offer",
  heroImage: HERO.climate,
  description:
    "The Climate Adaptation Finance Pact offers the country a co-financing deal: pact money for sea walls, drainage, cooling and clean power, matched by a national contribution and a binding emissions plan.",
  durationTurns: 6,
  fromYear: 2029,
  trigger: random(240, 0.003),
  wireStart: "The Climate Adaptation Finance Pact has offered the country a co-financing deal.",
  wireEnd: "The climate finance offer has closed.",
  prompt: {
    title: "Climate finance offer",
    description:
      "The pact will match national money for resilience and clean power, but the emissions plan binds future budgets. What does the government do?",
  },
  accept: [
    {
      id: "full_partnership",
      label: "Join as a full partner",
      description:
        "Match the pact money in full and accept the binding emissions plan. The biggest build-out, and a real bill now.",
      effects: [
        fx(
          "flat",
          "metric",
          "economy",
          "gdp",
          -0.005,
          "National match diverted from other spending"
        ),
        fx("flat", "approval", "business", "overall", -0.02, "Industry dislikes the binding plan"),
      ],
    },
    {
      id: "adaptation_only",
      label: "Take adaptation money only",
      description:
        "Accept the money for sea walls and drainage but not the emissions plan. Cheaper, smaller, and the pact trims its share.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.002, "Smaller national match"),
        fx("flat", "approval", "youthVoters", "overall", -0.02, "Seen as dodging the climate plan"),
      ],
    },
  ],
  decline: {
    label: "Decline the offer",
    description: "Keep full control of the budget. No match, no new defenses.",
  },
  fund: {
    title: "Resilience co-financing",
    description:
      "The national share of the pact program. Fuller funding brings more projects into the first wave.",
    target: 25_000_000,
  },
  outcome: {
    message:
      "Pact-funded sea walls, drainage and clean power projects are underway. Insurers are watching the risk maps improve.",
    effects: [
      fx("flat", "metric", "economy", "renewableShare", 0.03, "Clean power co-financed"),
      fx("flat", "metric", "infrastructure", "damage", -0.03, "Resilience gap narrowed"),
      fx("flat", "metric", "infrastructure", "power", 0.02, "Grid hardened"),
    ],
  },
});

const SCIENCE_MEGAPROJECT = opportunity({
  name: "Science Megaproject Invitation",
  heroImage: HERO.science,
  description:
    "An international consortium invites the country to buy into a shared megaproject: a next generation collider, fusion test reactor or deep space observatory. Members that pay in share the instruments, the contracts and the research.",
  durationTurns: 6,
  fromYear: 2032,
  trigger: random(288, 0.0025),
  wireStart: "A science consortium has invited the country to join its megaproject.",
  wireEnd: "The consortium has closed its membership round.",
  prompt: {
    title: "Megaproject membership",
    description:
      "Membership is expensive and the payoff is slow, but members get the contracts and the research. What does the government do?",
  },
  accept: [
    {
      id: "founding_member",
      label: "Join as a founding member",
      description:
        "Pay the full founding share and host a major component. The largest research boost, and a large bill.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.006, "Founding share paid"),
        fx("flat", "approval", "government", "overall", -0.015, "Questions about the price tag"),
      ],
    },
    {
      id: "associate_member",
      label: "Join as an associate",
      description:
        "Pay a smaller share for access to the data and a slice of the contracts. A smaller boost for a smaller bill.",
      effects: [fx("flat", "metric", "economy", "gdp", -0.0025, "Associate share paid")],
    },
  ],
  decline: {
    label: "Stay out",
    description: "Keep the money at home. Domestic labs will read the results a year late.",
  },
  fund: {
    title: "National research stake",
    description:
      "Money for the domestic labs and firms that will build and use the instruments. Fuller funding means a bigger share of the research.",
    target: 30_000_000,
  },
  outcome: {
    message:
      "The country is a member of the consortium. Domestic labs are on the instrument teams and local firms have won build contracts.",
    effects: [
      fx("flat", "metric", "economic", "rdIntensity", 0.003, "Shared research boost"),
      fx("flat", "metric", "economy", "investorConfidence", 0.02, "High-tech contracts won"),
      fx("flat", "metric", "economic", "smallBusinessFormation", 0.02, "Research spinouts"),
    ],
  },
});

// ── SPORT AND CULTURE ──────────────────────────────────────────────────────

const OLYMPIC_BID = opportunity({
  name: "Olympic Hosting Bid",
  heroImage: HERO.stadium,
  description:
    "The country has a credible shot at hosting a future Olympic Games. A winning bid means stadiums, transit and an athletes' village, years of construction work and a global audience. Host cities have also been left with debt and empty arenas.",
  durationTurns: 6,
  fromYear: 2027,
  trigger: random(480, 0.0015),
  wireStart: "The national Olympic committee is preparing a hosting bid.",
  wireEnd: "The Olympic bid process has closed.",
  prompt: {
    title: "Olympic bid",
    description:
      "A full bid wins the Games and the construction boom. A lean bid reuses existing venues. Both cost money. What does the government do?",
  },
  accept: [
    {
      id: "full_bid",
      label: "Back a full bid with new venues",
      description:
        "Fund new stadiums, transit and housing. The biggest boost to jobs and pride, and the biggest bill if costs run over.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.008, "Bid and venue construction costs"),
        fx("flat", "metric", "economy", "housing", 0.02, "Land prices rise around the venues"),
      ],
    },
    {
      id: "lean_bid",
      label: "Back a lean bid with existing venues",
      description:
        "Reuse arenas and temporary stands. Cheaper and safer, with a smaller lift and some grumbling that the country is thinking small.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.003, "Bid and refit costs"),
        fx("flat", "approval", "government", "overall", -0.01, "Seen as a half-hearted bid"),
      ],
    },
  ],
  decline: {
    label: "Do not bid",
    description: "Spend nothing and watch another country host.",
  },
  fund: {
    title: "Games delivery fund",
    description:
      "Money for venues, transit and security. Fuller funding keeps the build on schedule.",
    target: 40_000_000,
  },
  outcome: {
    message:
      "The bid succeeded and the Games are coming. Construction crews are on site and visitor bookings are climbing.",
    effects: [
      fx(
        "flat",
        "metric",
        "economy",
        "unemployment",
        -0.008,
        "Construction and hospitality hiring"
      ),
      fx("flat", "metric", "economy", "consumerConfidence", 0.03, "National excitement"),
      fx("flat", "metric", "economy", "exports", 0.015, "Tourism receipts"),
      fx("flat", "approval", "government", "overall", 0.02, "Pride in winning the Games"),
    ],
  },
});

const WORLD_CUP_BID = opportunity({
  name: "World Cup Hosting Bid",
  heroImage: HERO.stadium,
  description:
    "The football federation wants to bid to host a World Cup. It means a month of matches, a million visitors and stadium upgrades across the country, at a price paid mostly by the public.",
  durationTurns: 6,
  fromYear: 2027,
  trigger: random(480, 0.0015),
  wireStart: "The football federation is lobbying for a World Cup hosting bid.",
  wireEnd: "The World Cup bid process has closed.",
  prompt: {
    title: "World Cup bid",
    description:
      "The federation wants public money for stadiums and transport. What does the government do?",
  },
  accept: [
    {
      id: "national_bid",
      label: "Fund a national bid",
      description:
        "Upgrade stadiums in every host city and fund the transport links. Jobs and pride, with a large public bill.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.006, "Stadium and transport upgrades"),
        fx("flat", "approval", "reformers", "overall", -0.02, "Critics question stadium spending"),
      ],
    },
    {
      id: "joint_bid",
      label: "Join a co-hosted bid",
      description:
        "Share the tournament with neighbors. Fewer matches at home, and a bill to match.",
      effects: [fx("flat", "metric", "economy", "gdp", -0.0025, "Share of co-host costs")],
    },
  ],
  decline: {
    label: "Do not bid",
    description: "The federation is disappointed. No public money is spent.",
  },
  fund: {
    title: "Host city fund",
    description:
      "Money for stadium upgrades, fan zones and transport. Fuller funding keeps every host city on schedule.",
    target: 30_000_000,
  },
  outcome: {
    message:
      "The tournament is coming. Host cities are upgrading stadiums and hotels are booking out for the summer.",
    effects: [
      fx("flat", "metric", "economy", "unemployment", -0.005, "Stadium and hospitality hiring"),
      fx("flat", "metric", "economy", "consumerConfidence", 0.025, "Football fever"),
      fx("flat", "metric", "economy", "exports", 0.01, "Visitor spending"),
      fx("flat", "approval", "government", "overall", 0.015, "Pride in hosting"),
    ],
  },
});

const CULTURAL_BREAKOUT = opportunity({
  name: "Cultural Breakout Moment",
  heroImage: HERO.culture,
  description:
    "A film, an album and a streaming series from the country have broken through worldwide at the same moment. Audiences abroad are suddenly curious about its food, language and cities. The question is whether to invest behind the wave or let it pass.",
  durationTurns: 4,
  fromYear: 2027,
  trigger: random(288, 0.003),
  wireStart:
    "The country's artists are topping charts worldwide. Tourism boards report a surge in interest.",
  wireEnd: "The cultural moment has peaked.",
  prompt: {
    title: "Cultural moment",
    description:
      "The creative industries want backing to turn a moment into a lasting export. What does the government do?",
  },
  accept: [
    {
      id: "creative_fund",
      label: "Launch a creative export fund",
      description:
        "Back studios, touring and language schools abroad. A lasting lift, paid for by cuts elsewhere.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.002, "Fund paid for by cuts elsewhere"),
        fx("flat", "approval", "base", "overall", -0.01, "Some voters call it frivolous"),
      ],
    },
    {
      id: "tourism_campaign",
      label: "Run a tourism campaign",
      description:
        "Spend on advertising and visas for visitors. Cheaper and quicker, with a shorter tail.",
      effects: [fx("flat", "metric", "economy", "gdp", -0.001, "Campaign costs")],
    },
  ],
  decline: {
    label: "Let the moment pass",
    description: "Leave it to the market. The wave fades on its own schedule.",
  },
  fund: {
    title: "Creative industries fund",
    description: "Money for studios, festivals and touring. Fuller funding extends the wave.",
    target: 10_000_000,
  },
  outcome: {
    message:
      "The creative sector has turned the moment into a lasting export. Visitors and licensing income are both up.",
    effects: [
      fx("flat", "metric", "economy", "exports", 0.015, "Licensing and tourism income"),
      fx("flat", "metric", "economy", "consumerConfidence", 0.015, "National pride"),
      fx("flat", "metric", "economic", "smallBusinessFormation", 0.015, "Creative startups"),
    ],
  },
});

const WORLD_EXPO_BID = opportunity({
  name: "World Expo Bid",
  heroImage: HERO.culture,
  description:
    "The country is invited to bid for a World Expo. Six months of pavilions, trade delegations and visitors from every member state, and a new district built on the site afterwards. Recent hosts have been left with large bills and half empty sites.",
  durationTurns: 5,
  fromYear: 2033,
  trigger: random(480, 0.002),
  wireStart: "The country has been invited to bid for a World Expo.",
  wireEnd: "The World Expo bid round has closed.",
  prompt: {
    title: "World Expo bid",
    description:
      "An Expo brings trade delegations and a new district. It also brings a construction bill. What does the government do?",
  },
  accept: [
    {
      id: "flagship_expo",
      label: "Bid with a flagship new district",
      description:
        "Build a permanent district for the Expo and its afterlife. The biggest draw and the biggest bill.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.006, "Site and district construction"),
        fx("flat", "approval", "government", "overall", -0.01, "Cost overrun fears"),
      ],
    },
    {
      id: "compact_expo",
      label: "Bid with a compact temporary site",
      description: "Use temporary pavilions on existing land. Cheaper, smaller and easy to clear.",
      effects: [fx("flat", "metric", "economy", "gdp", -0.002, "Temporary site costs")],
    },
  ],
  decline: {
    label: "Do not bid",
    description: "No bid and no bill. The Expo goes elsewhere.",
  },
  fund: {
    title: "Expo delivery fund",
    description: "Money for the site, pavilions and transport. Fuller funding keeps it on time.",
    target: 25_000_000,
  },
  outcome: {
    message:
      "The country won the Expo. Trade delegations are booking pavilions and the site is under construction.",
    effects: [
      fx("flat", "metric", "economy", "exports", 0.02, "Trade delegations sign deals"),
      fx("flat", "metric", "economy", "investorConfidence", 0.02, "Showcase for investors"),
      fx("flat", "metric", "economy", "unemployment", -0.004, "Site construction jobs"),
    ],
  },
});

export const OPPORTUNITY_2027_TEMPLATES: Record<string, CrisisTemplate> = {
  bilateral_trade_deal_offer: TRADE_DEAL_OFFER,
  global_minimum_tax_accord: MINIMUM_TAX_ACCORD,
  climate_finance_pact_offer: CLIMATE_FINANCE_PACT,
  science_megaproject_invitation: SCIENCE_MEGAPROJECT,
  olympic_hosting_bid: OLYMPIC_BID,
  world_cup_hosting_bid: WORLD_CUP_BID,
  cultural_breakout_moment: CULTURAL_BREAKOUT,
  world_expo_bid: WORLD_EXPO_BID,
};
