import { pe, type PackEvent } from "@/lib/events/pree/packTypes";

/**
 * Modern-years country events for CN (2027 onward), seeded with
 * requiresCountryIds: ["CN"]. They pick up where the earlier country pack
 * stops. Definitions and handlers are both generated from this one list.
 */
const MODERN = { minYear: 2027, requiresCountryIds: ["CN"], cooldown: [48, 96] } as const;

export const CN_MODERN_PACK: PackEvent[] = [
  {
    ...MODERN,
    kind: "pree.cn.groupBuyChat",
    title: "The Neighborhood Group Chat",
    headline: "Your residential compound runs a group-buying chat for everything.",
    body: "Vegetables, laundry detergent, even the occasional plumber. The group admin is asking for volunteers to coordinate deliveries.",
    baseWeight: 35,
    options: [
      {
        id: "volunteerAdmin",
        label: "Volunteer to coordinate",
        description: "Take on the spreadsheets and the drivers.",
        stat: "energy",
        tiers: [
          "The whole compound thanks you",
          "A useful job well done",
          "Wrong order, angry grandmother",
        ],
        high: pe(4),
        mid: pe(2),
        low: pe(-1),
      },
      {
        id: "joinOrders",
        label: "Just join the orders",
        description: "Take the discounts and keep quiet.",
        isDefault: true,
        tiers: ["A nice saving", "A small saving", "The vegetables are wilted"],
        high: pe(0, 150),
        mid: pe(0, 75),
        low: pe(0, -50),
      },
      {
        id: "startRival",
        label: "Start a rival chat with better prices",
        description: "Compete for the compound's business.",
        stat: "businessAcumen",
        tiers: ["Your chat takes over", "A small circle of regulars", "The admin freezes you out"],
        high: pe(2, 300),
        mid: pe(0, 100),
        low: pe(-2),
      },
    ],
  },
  {
    ...MODERN,
    kind: "pree.cn.evPriceWar",
    title: "The Price War Showroom",
    headline: "An electric car price war has broken out and every dealer is slashing prices.",
    body: "A new model is cheaper than last year's phone contract, and the fine print is a maze of financing deals. The showroom crowds are enormous.",
    baseWeight: 35,
    options: [
      {
        id: "buyNew",
        label: "Buy a new model",
        description: "Lock in the discount.",
        tiers: [
          "Your car is a bargain",
          "A fair price for a good car",
          "A cheaper model appears next month",
        ],
        high: pe(1, 150),
        mid: pe(0, -100),
        low: pe(-1, -300),
      },
      {
        id: "readFinePrint",
        label: "Read the financing terms line by line",
        description: "Know the real price.",
        stat: "intellect",
        isDefault: true,
        tiers: ["You dodge a nasty fee", "Nothing alarming", "Your head hurts"],
        high: pe(0, 250),
        mid: pe(0, 50),
        low: [],
      },
      {
        id: "waitMore",
        label: "Wait for prices to fall further",
        description: "The war has not ended.",
        tiers: ["Prices dropped again", "Prices held steady", "The sale ends"],
        high: pe(0, 250),
        mid: [],
        low: pe(0, -200),
      },
    ],
  },
  {
    ...MODERN,
    kind: "pree.cn.tutorBotExam",
    title: "The Tutor Bot and the Gaokao",
    headline: "Schools have approved AI tutors for exam revision.",
    body: "Your family's student can have a patient tutor around the clock. Some parents worry about over-reliance, and others about being left behind.",
    baseWeight: 30,
    options: [
      {
        id: "useTutor",
        label: "Subscribe to the AI tutor",
        description: "Let the student revise with it every night.",
        tiers: ["Marks leap up", "Steady improvement", "The student leans on it too much"],
        high: pe(2, -150),
        mid: pe(1, -150),
        low: pe(0, -150),
      },
      {
        id: "mixHuman",
        label: "Blend it with a human tutor",
        description: "Use both and watch what works.",
        stat: "businessAcumen",
        isDefault: true,
        tiers: ["The best of both", "A balanced approach", "An expensive compromise"],
        high: pe(3, -300),
        mid: pe(2, -300),
        low: pe(0, -450),
      },
      {
        id: "oldFashioned",
        label: "Stick to books and past papers",
        description: "A steady, proven way.",
        tiers: ["Disciplined and well-prepared", "A solid result", "Others get ahead"],
        high: pe(2),
        mid: pe(1),
        low: pe(-1),
      },
    ],
  },
];
