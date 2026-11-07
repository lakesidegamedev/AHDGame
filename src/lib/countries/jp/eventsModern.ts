import { pe, type PackEvent } from "@/lib/events/pree/packTypes";

/**
 * Modern-years country events for JP (2027 onward), seeded with
 * requiresCountryIds: ["JP"]. They pick up where the earlier country pack
 * stops. Definitions and handlers are both generated from this one list.
 */
const MODERN = { minYear: 2027, requiresCountryIds: ["JP"], cooldown: [48, 96] } as const;

export const JP_MODERN_PACK: PackEvent[] = [
  {
    ...MODERN,
    kind: "pree.jp.akiyaInheritance",
    title: "The Empty House",
    headline: "You have inherited a vacant house in a shrinking village.",
    body: "The roof leaks, the garden is a jungle and the village headman visits every month to ask what you plan to do. Abandoned houses are an official worry.",
    baseWeight: 35,
    options: [
      {
        id: "renovateAsRetreat",
        label: "Renovate it as a countryside retreat",
        description: "Spend on repairs and let it to city visitors.",
        stat: "businessAcumen",
        tiers: [
          "Booked solid by remote workers",
          "A modest income",
          "The roof costs twice the estimate",
        ],
        high: pe(2, 600),
        mid: pe(1, 150),
        low: pe(0, -700),
      },
      {
        id: "giveToVillage",
        label: "Donate it to the village",
        description: "Let the community turn it into a gathering place.",
        tiers: [
          "The village names the hall after your family",
          "Warmly received",
          "A paperwork saga",
        ],
        high: pe(4),
        mid: pe(2),
        low: pe(0),
      },
      {
        id: "leaveEmpty",
        label: "Leave it as it is",
        description: "Deal with it later.",
        isDefault: true,
        tiers: ["No consequence", "A fine notice arrives", "A typhoon takes the shed"],
        high: [],
        mid: pe(0, -100),
        low: pe(-1, -300),
      },
    ],
  },
  {
    ...MODERN,
    kind: "pree.jp.trenchAdvisory",
    title: "The Megaquake Advisory",
    headline:
      "Authorities have issued a special advisory about a possible megaquake on the southern coast.",
    body: "It is not a prediction, they stress, only a raised probability. Shops sell out of water and the evacuation maps are on every notice board.",
    baseWeight: 35,
    options: [
      {
        id: "prepareKit",
        label: "Stock your emergency kit",
        description: "Water, a radio and a go-bag by the door.",
        isDefault: true,
        tiers: [
          "You have the best-organized household on the street",
          "Sensible, ready",
          "A pile of kit and no space to put it",
        ],
        high: pe(2, -100),
        mid: pe(1, -100),
        low: pe(0, -150),
      },
      {
        id: "leadDrill",
        label: "Lead a neighborhood evacuation drill",
        description: "Walk the routes together.",
        stat: "energy",
        tiers: ["The whole district joins in", "A good turnout", "Only a handful show up"],
        high: pe(4),
        mid: pe(2),
        low: pe(1),
      },
      {
        id: "carryOn",
        label: "Carry on as normal",
        description: "No sense in worrying.",
        tiers: ["Nothing happens", "Nothing happens", "A small tremor and some embarrassment"],
        low: pe(-1),
      },
    ],
  },
  {
    ...MODERN,
    kind: "pree.jp.convenienceStoreRobots",
    title: "The Robot Konbini",
    headline: "The local convenience store has replaced its night shift with robots.",
    body: "Shelves are stocked by machines and the till is a voice. Older customers miss the clerk who knew their names, and the night staff are looking for work.",
    baseWeight: 30,
    options: [
      {
        id: "shopThere",
        label: "Keep shopping there",
        description: "It is faster and open all hours.",
        tiers: ["Perfectly good service", "Fine, if quiet", "The till gets your order wrong"],
        high: pe(0, 50),
        mid: [],
        low: pe(-1),
      },
      {
        id: "helpStaff",
        label: "Help the displaced staff find work",
        description: "Use your contacts to make introductions.",
        stat: "charisma",
        tiers: ["Three of them land good jobs", "Two find something", "Not much luck"],
        high: pe(4),
        mid: pe(2),
        low: pe(1),
      },
      {
        id: "supportShopkeeper",
        label: "Switch to the family-run shop down the street",
        description: "Pay a bit more for a human greeting.",
        isDefault: true,
        tiers: [
          "The shopkeeper repays you with kindness",
          "A warm welcome",
          "Higher prices, same milk",
        ],
        high: pe(2, -50),
        mid: pe(1, -50),
        low: pe(0, -100),
      },
    ],
  },
];
