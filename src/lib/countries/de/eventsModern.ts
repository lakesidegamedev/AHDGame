import { pe, type PackEvent } from "@/lib/events/pree/packTypes";

/**
 * Modern-years country events for DE (2027 onward), seeded with
 * requiresCountryIds: ["DE"]. They pick up where the earlier country pack
 * stops. Definitions and handlers are both generated from this one list.
 */
const MODERN = { minYear: 2027, requiresCountryIds: ["DE"], cooldown: [48, 96] } as const;

export const DE_MODERN_PACK: PackEvent[] = [
  {
    ...MODERN,
    kind: "pree.de.balconySolar",
    title: "Solar on the Balcony",
    headline: "Plug-in balcony solar panels have taken over the apartment block.",
    body: "Everybody in the stairwell has a panel on the railing and an opinion about the meter. The landlord has sent a stern letter.",
    baseWeight: 35,
    options: [
      {
        id: "installPanels",
        label: "Install two panels",
        description: "Fit them yourself and register the kit.",
        stat: "intellect",
        tiers: [
          "Bills fall and you become the block's expert",
          "A modest saving",
          "The meter runs backwards and then an inspector calls",
        ],
        high: pe(2, 250),
        mid: pe(1, 100),
        low: pe(-1, -150),
      },
      {
        id: "talkToLandlord",
        label: "Organize a tenants' meeting",
        description: "Settle the landlord's objections together.",
        stat: "charisma",
        isDefault: true,
        tiers: [
          "The landlord agrees to a block-wide scheme",
          "A workable rule",
          "Hours of arguing about balcony rules",
        ],
        high: pe(4),
        mid: pe(2),
        low: pe(0),
      },
      {
        id: "stayOut",
        label: "Stay out of it",
        description: "Not worth the fuss.",
        tiers: ["No consequence", "No consequence", "Your neighbors' bills drop and yours doesn't"],
        low: pe(0, -50),
      },
    ],
  },
  {
    ...MODERN,
    kind: "pree.de.shortTimeWork",
    title: "Short-Time at the Plant",
    headline: "The big plant on the edge of town has put its shifts on short-time work.",
    body: "Orders for the old combustion line have collapsed. The works council wants community support and the mayor is calling meetings.",
    baseWeight: 35,
    options: [
      {
        id: "backWorks",
        label: "Back the works council publicly",
        description: "Stand with the employees at the gate.",
        tiers: [
          "The plant wins a retraining program",
          "A warm response from the workers",
          "Management is cool toward you",
        ],
        high: pe(4),
        mid: pe(2),
        low: pe(-1),
      },
      {
        id: "pushNewIndustry",
        label: "Push for a new employer on the site",
        description: "Pitch the empty halls to a battery or hydrogen firm.",
        stat: "businessAcumen",
        tiers: ["A new anchor tenant signs", "Serious interest", "Years of talks, nothing signed"],
        high: pe(3, 300),
        mid: pe(1),
        low: pe(0),
      },
      {
        id: "waitForOrders",
        label: "Wait for orders to return",
        description: "Markets turn.",
        isDefault: true,
        tiers: [
          "Orders return in the spring",
          "Slow, partial recovery",
          "The line closes for good",
        ],
        high: pe(1),
        mid: [],
        low: pe(-3),
      },
    ],
  },
  {
    ...MODERN,
    kind: "pree.de.hydrogenPipelineHearing",
    title: "The Hydrogen Pipeline Hearing",
    headline: "A hydrogen pipeline is planned across your district.",
    body: "It would link the coast to the industrial belt. Farmers worry about the route, and the pipeline company brings maps and a lot of confidence.",
    baseWeight: 30,
    options: [
      {
        id: "supportRoute",
        label: "Support the route",
        description: "Industry needs the supply.",
        tiers: [
          "Fair compensation for landowners",
          "Approved with conditions",
          "A fiery meeting, and you are blamed",
        ],
        high: pe(2, 200),
        mid: pe(1),
        low: pe(-2),
      },
      {
        id: "demandSafety",
        label: "Demand independent safety studies",
        description: "Don't object, but check the facts.",
        stat: "debate",
        isDefault: true,
        tiers: [
          "A respected voice of reason",
          "Reasonable conditions added",
          "Called an obstructionist",
        ],
        high: pe(3),
        mid: pe(2),
        low: pe(-1),
      },
      {
        id: "opposeRoute",
        label: "Oppose the route",
        description: "Back the farmers.",
        tiers: ["The route is moved", "A compromise", "The pipeline goes ahead anyway"],
        high: pe(3),
        mid: pe(1),
        low: pe(-1),
      },
    ],
  },
];
