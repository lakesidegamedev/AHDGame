import { pe, type PackEvent } from "@/lib/events/pree/packTypes";

/**
 * Modern-years country events for UK (2027 onward), seeded with
 * requiresCountryIds: ["UK"]. They pick up where the earlier country pack
 * stops. Definitions and handlers are both generated from this one list.
 */
const MODERN = { minYear: 2027, requiresCountryIds: ["UK"], cooldown: [48, 96] } as const;

export const UK_MODERN_PACK: PackEvent[] = [
  {
    ...MODERN,
    kind: "pree.uk.heatNetworkSwitch",
    title: "The Heat Network Letter",
    headline: "Your street is being offered a connection to a district heat network.",
    body: "The gas boilers go, the pipes come up, and a utility promises lower bills in five years. The roadworks are due to start in a fortnight.",
    baseWeight: 35,
    options: [
      {
        id: "connectNow",
        label: "Sign up on day one",
        description: "Take the early-bird connection offer.",
        tiers: [
          "Bills fall sooner than promised",
          "A fair deal in the end",
          "Months of digging outside your door",
        ],
        high: pe(1, 400),
        mid: pe(0, 150),
        low: pe(-1, -200),
      },
      {
        id: "waitForNeighbors",
        label: "See how the neighbors get on",
        description: "Wait for someone else to find the snags.",
        isDefault: true,
        tiers: ["A cheaper connection later", "No change", "The offer lapses"],
        high: pe(0, 150),
        mid: [],
        low: pe(0, -100),
      },
      {
        id: "keepBoiler",
        label: "Keep the boiler and say no",
        description: "You like your own heating.",
        tiers: ["Your boiler outlasts the scheme", "No consequence", "Gas prices bite"],
        high: pe(0, 100),
        mid: [],
        low: pe(0, -300),
      },
    ],
  },
  {
    ...MODERN,
    kind: "pree.uk.barrierOpenDay",
    title: "The Barrier Open Day",
    headline: "The tidal barrier on the river is holding an open day.",
    body: "It has been raised more often than anyone predicted, and a new gate is being planned. Engineers will explain the numbers to anyone who asks.",
    baseWeight: 25,
    options: [
      {
        id: "takeTour",
        label: "Take the guided tour",
        description: "See how the machine works.",
        stat: "intellect",
        tiers: [
          "You come away well-informed and quoted in the paper",
          "A fascinating morning",
          "Rain on the riverside",
        ],
        high: pe(2),
        mid: pe(1),
        low: pe(0),
      },
      {
        id: "askAboutCost",
        label: "Ask about the cost of the next gate",
        description: "Put the engineers on the spot.",
        stat: "debate",
        tiers: ["Your question makes the evening news", "A frank answer", "A polite brush-off"],
        high: pe(2),
        mid: pe(1),
        low: pe(0),
      },
      {
        id: "walkThePath",
        label: "Just walk the river path",
        description: "Enjoy the view.",
        isDefault: true,
        tiers: ["A pleasant stroll", "A pleasant stroll", "A pleasant stroll"],
      },
    ],
  },
  {
    ...MODERN,
    kind: "pree.uk.digitalIdRollout",
    title: "The Digital ID Rollout",
    headline: "The new digital identity scheme is now being rolled out in your area.",
    body: "It promises one login for everything from benefits to the GP. Privacy campaigners say it is a database waiting for trouble.",
    baseWeight: 35,
    options: [
      {
        id: "enrolEarly",
        label: "Enrol on the first day",
        description: "Get ahead of the queues.",
        tiers: ["Everything works first time", "Mostly smooth", "The app locks you out for a week"],
        high: pe(1),
        mid: [],
        low: pe(-1),
      },
      {
        id: "joinCampaign",
        label: "Join the privacy campaign",
        description: "Argue for safeguards and independent oversight.",
        stat: "debate",
        tiers: [
          "Your campaign wins an oversight board",
          "A decent turnout",
          "Labeled a conspiracy theorist",
        ],
        high: pe(3),
        mid: pe(1),
        low: pe(-2),
      },
      {
        id: "enrolLater",
        label: "Enrol when you have to",
        description: "No hurry.",
        isDefault: true,
        tiers: ["No consequence", "No consequence", "A last-minute queue"],
        low: pe(-1),
      },
    ],
  },
];
