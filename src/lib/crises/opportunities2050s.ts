import type { CrisisTemplate } from "@/lib/db/types/crisis";
import { fx } from "@/lib/crises/templateHelpers";
import { HERO, opportunity, random } from "@/lib/crises/opportunities2027";

/**
 * Opportunities for the 2050s. Same rules as the 2027 set: every way of taking
 * an offer up has a price, the payoff lands only on paid paths, declining or
 * not answering costs nothing, and nothing is scheduled.
 */

const ORBITAL_SOLAR = opportunity({
  name: "Orbital Solar Partnership",
  heroImage: HERO.climate,
  description:
    "A consortium proposes a shared orbital solar array that beams clean power to ground stations. Members get a guaranteed share of the output, but must pay for the ground links and accept inspection of their grid.",
  durationTurns: 6,
  fromYear: 2050,
  untilYear: 2059,
  trigger: random(240, 0.0025),
  wireStart: "A consortium has invited the country to join an orbital solar partnership.",
  wireEnd: "The orbital solar membership window has closed.",
  prompt: {
    title: "Orbital solar partnership",
    description:
      "Joining brings cheap, steady power. It also means sharing grid data with partners. What does the government do?",
  },
  accept: [
    {
      id: "join_full_share",
      label: "Join with a full share",
      description:
        "Buy the largest allocation and build the ground stations. The most power, and the biggest bill.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.004, "Ground station construction"),
        fx("flat", "metric", "economy", "investorConfidence", -0.01, "Large public commitment"),
      ],
    },
    {
      id: "join_small_share",
      label: "Join with a starter share",
      description:
        "Take a smaller allocation and grow it later. Lower cost and less power, with room to expand.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.0015, "Modest ground link costs"),
        fx("flat", "approval", "government", "overall", -0.01, "Critics call it timid"),
      ],
    },
  ],
  decline: {
    label: "Stay out",
    description: "Keep the current grid plans. No bill, and no new supply.",
  },
  fund: {
    title: "Ground link fund",
    description:
      "Money for receiving stations and grid connections. Fuller funding brings power online sooner.",
    target: 15_000_000,
  },
  outcome: {
    message:
      "Orbital power is feeding the grid. Prices are steadier and the grid is more reliable.",
    effects: [
      fx("flat", "metric", "infrastructure", "power", 0.03, "Steady clean supply"),
      fx("flat", "metric", "economy", "renewableShare", 0.02, "More clean power"),
      fx("flat", "approval", "government", "overall", 0.015, "Bills fall"),
    ],
  },
});

const OCEAN_ACCORD = opportunity({
  name: "Living Ocean Accord",
  heroImage: HERO.water,
  description:
    "Fishing and coastal nations invite the country to join a binding accord on catch limits, reef restoration and shared monitoring. Membership costs the fishing fleet some catch now and pays back in healthier waters.",
  durationTurns: 6,
  fromYear: 2050,
  untilYear: 2059,
  trigger: random(240, 0.0025),
  wireStart: "Coastal nations have invited the country to sign the Living Ocean Accord.",
  wireEnd: "The Living Ocean Accord signing window has closed.",
  prompt: {
    title: "Living Ocean Accord",
    description:
      "Fleets will fish less in the short run. Coastal towns that live on tourism want it signed. What does the government do?",
  },
  accept: [
    {
      id: "sign_strict",
      label: "Sign with strict catch limits",
      description:
        "Take the strongest limits. The fastest recovery, and the sharpest hit to the fleet.",
      effects: [
        fx("flat", "metric", "economy", "exports", -0.01, "Seafood exports fall"),
        fx("flat", "approval", "workers", "overall", -0.03, "Fishing communities object"),
      ],
    },
    {
      id: "sign_phased",
      label: "Sign with phased limits",
      description: "Tighten limits over several years. A gentler path, and a slower recovery.",
      effects: [
        fx("flat", "metric", "economy", "exports", -0.004, "Gradual export decline"),
        fx("flat", "approval", "reformers", "overall", -0.015, "Seen as too slow"),
      ],
    },
  ],
  decline: {
    label: "Stay out",
    description: "Keep current fishing rules. No cost, and no recovery plan.",
  },
  fund: {
    title: "Coastal transition fund",
    description: "Money to retrain fishers and restore reef. Fuller funding speeds the recovery.",
    target: 12_000_000,
  },
  outcome: {
    message: "Fish stocks are rebuilding and coastal towns are earning from restored reefs.",
    effects: [
      fx("flat", "metric", "economy", "exports", 0.02, "Healthier fisheries"),
      fx("flat", "metric", "economy", "gdp", 0.004, "Coastal tourism grows"),
      fx("flat", "approval", "government", "overall", 0.015, "Coastal towns benefit"),
    ],
  },
});

const LONGEVITY_COMPACT = opportunity({
  name: "Longevity Science Compact",
  heroImage: HERO.science,
  description:
    "Research nations propose a compact to pool trial data on treatments that slow ageing. Members get early access to results and a seat on the ethics board, but must open their health records to approved researchers.",
  durationTurns: 6,
  fromYear: 2050,
  untilYear: 2059,
  trigger: random(240, 0.0025),
  wireStart: "Research nations have invited the country to a longevity science compact.",
  wireEnd: "The longevity compact signing window has closed.",
  prompt: {
    title: "Longevity science compact",
    description:
      "Early access could lift the country's health and research standing. Privacy advocates are alarmed. What does the government do?",
  },
  accept: [
    {
      id: "full_data_sharing",
      label: "Share records widely with strong safeguards",
      description: "The richest data and the biggest payoff. Some voters will never trust it.",
      effects: [
        fx("flat", "approval", "reformers", "overall", -0.03, "Privacy campaigners object"),
        fx("flat", "metric", "publicsafety", "confidence", -0.01, "Worry over data leaks"),
      ],
    },
    {
      id: "consent_only",
      label: "Share only with explicit patient consent",
      description: "Slower and smaller, but trusted. Costs time and researcher goodwill.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.002, "Slow consent paperwork"),
        fx("flat", "approval", "business", "overall", -0.01, "Research firms want more access"),
      ],
    },
  ],
  decline: {
    label: "Stay out",
    description: "Keep health data at home. No exposure, and no early access.",
  },
  fund: {
    title: "National trial fund",
    description: "Money for clinics and trial staff. Fuller funding brings results sooner.",
    target: 14_000_000,
  },
  outcome: {
    message:
      "Early results are flowing in and new treatments are reaching clinics. The country is a research draw.",
    effects: [
      fx("flat", "metric", "economy", "investorConfidence", 0.02, "Research investment arrives"),
      fx("flat", "metric", "publicsafety", "confidence", 0.015, "Better health outcomes"),
      fx("flat", "approval", "government", "overall", 0.015, "Visible health gains"),
    ],
  },
});

const SPACE_SUPPLY_CONSORTIUM = opportunity({
  name: "Interplanetary Supply Consortium",
  heroImage: HERO.tech,
  description:
    "A consortium building supply lines to off-world settlements offers the country a seat. Members get launch contracts for their firms, but must underwrite shared insurance and standards.",
  durationTurns: 6,
  fromYear: 2050,
  untilYear: 2059,
  trigger: random(240, 0.0025),
  wireStart: "A supply consortium for off-world settlements has offered the country a seat.",
  wireEnd: "The consortium seat offer has closed.",
  prompt: {
    title: "Supply consortium seat",
    description:
      "Launch contracts could lift industry. The insurance pool could cost a lot if a mission fails. What does the government do?",
  },
  accept: [
    {
      id: "take_full_seat",
      label: "Take a full seat and underwrite the pool",
      description: "The largest contract share and the largest exposure.",
      effects: [
        fx(
          "flat",
          "metric",
          "economy",
          "investorConfidence",
          -0.012,
          "Open-ended insurance exposure"
        ),
        fx("flat", "metric", "economy", "gdp", -0.003, "Up-front underwriting costs"),
      ],
    },
    {
      id: "take_observer_seat",
      label: "Take an observer seat with limited contracts",
      description: "Smaller share and exposure. Firms get a foot in the door.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.001, "Membership fee"),
        fx("flat", "approval", "business", "overall", -0.01, "Firms want a full seat"),
      ],
    },
  ],
  decline: {
    label: "Pass",
    description: "Stay on the ground. No exposure, and no contracts.",
  },
  fund: {
    title: "Launch industry fund",
    description: "Money for suppliers and test facilities. Fuller funding wins more contracts.",
    target: 16_000_000,
  },
  outcome: {
    message:
      "National firms are winning launch and supply contracts, and high-skill jobs are growing.",
    effects: [
      fx("flat", "metric", "economy", "exports", 0.02, "Contract exports"),
      fx("flat", "metric", "economy", "unemployment", -0.008, "High-skill jobs created"),
      fx("flat", "approval", "government", "overall", 0.015, "National pride"),
    ],
  },
});

export const OPPORTUNITY_2050S_TEMPLATES: Record<string, CrisisTemplate> = {
  orbital_solar_partnership_offer: ORBITAL_SOLAR,
  living_ocean_accord_offer: OCEAN_ACCORD,
  longevity_science_compact_offer: LONGEVITY_COMPACT,
  interplanetary_supply_consortium_offer: SPACE_SUPPLY_CONSORTIUM,
};
