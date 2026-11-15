import { ARCTIC_OPENING_KEY } from "../../rules/waveFamilyTables";
import { buildWaveFamilyDef } from "../waveFamilyFactory";

/** Melting ice opens shipping lanes and seabed claims, and a scramble begins. */
export const ARCTIC_OPENING_DEF = buildWaveFamilyDef({
  key: ARCTIC_OPENING_KEY,
  name: "Arctic Opening",
  phases: {
    onset: {
      label: "Ice retreats",
      summary: "Summer ice has retreated enough for ships and survey crews to work the far north.",
      headline: "Retreating ice opens new northern sea routes",
      body: "Shipping firms and mining companies are lodging claims and navies are sending patrol ships.",
    },
    peak: {
      label: "Scramble",
      summary: "Rival claims, ice-class fleets and seabed drilling are colliding.",
      headline: "Rival claims collide in the northern scramble",
      body: "Patrol ships are shadowing survey crews and insurers are pricing in the risk to shipping.",
    },
    recovery: {
      label: "Settlement",
      summary: "Talks and licensing rules are bringing order to the new routes.",
      headline: "Talks bring order to the northern sea routes",
      body: "Claims are being settled and shipping is moving under agreed rules.",
    },
    rested: {
      label: "Open and ruled",
      summary: "The routes are open under agreed rules. New disputes can still arise.",
      headline: "Northern sea routes settle under agreed rules",
      body: "Traffic is steady. Governments can still decide how much to invest in shared governance.",
    },
  },
  decision: {
    title: "The far north is opening up",
    description:
      "New routes and seabed claims are drawing rivals north. The government must decide its stance.",
  },
  levers: {
    contain: {
      id: "arctic_treaty",
      label: "Sign a northern treaty",
      description: "Agree shared rules on routes, fishing and seabed rights with neighbours.",
      costPctGdp: 0.001,
    },
    soften: {
      id: "extraction_licences",
      label: "Grant joint extraction concessions",
      description: "License seabed projects to shared consortiums with shared revenue.",
      costPctGdp: 0.001,
    },
    adapt: {
      id: "icebreaker_fleet",
      label: "Fund an icebreaker and rescue fleet",
      description: "Build ships and ports to keep the routes safe and open for everyone.",
      costPctGdp: 0.003,
    },
  },
  doNothing: {
    id: "press_unilateral_claims",
    label: "Press claims alone",
    description: "Lodge claims and patrol without talks.",
  },
  outcomes: {
    contained: {
      label: "Treaty signed",
      description: "Shared rules take the heat out of rival claims.",
      wire: "A northern treaty sets shared rules for the new sea routes.",
    },
    softened: {
      label: "Revenue shared",
      description: "Joint concessions give rivals a stake in calm.",
      wire: "Joint concessions give rivals a stake in northern calm.",
    },
    adapted: {
      label: "Routes made safe",
      description: "Rescue ships and ports keep traffic moving.",
      wire: "New rescue ships and ports keep northern sea routes open.",
    },
    unchecked: {
      onsetWire: "Rival claims pile up as the northern ice retreats.",
      peakWire: "A scramble for the north disrupts shipping.",
      description: "Without talks, rival claims harden.",
    },
    aftermath: {
      label: "Governance locked in",
      description: "A standing northern council keeps disputes in talks.",
      wire: "A standing council settles northern route disputes.",
    },
  },
  effects: [
    {
      category: "economy",
      field: "gdpGrowth",
      swing: -0.003,
      label: "Disrupted northern shipping",
    },
    { category: "economy", field: "inflation", swing: 0.002, label: "Shipping insurance costs" },
    {
      category: "economy",
      field: "consumerConfidence",
      swing: -0.008,
      label: "Fear of a standoff",
    },
  ],
  approvalSwing: -0.006,
});
