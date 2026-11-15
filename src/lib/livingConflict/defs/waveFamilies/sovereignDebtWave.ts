import { SOVEREIGN_DEBT_WAVE_KEY } from "../../rules/waveFamilyTables";
import { buildWaveFamilyDef } from "../waveFamilyFactory";

/** Several heavily indebted, slowing economies lose lender confidence together. */
export const SOVEREIGN_DEBT_WAVE_DEF = buildWaveFamilyDef({
  key: SOVEREIGN_DEBT_WAVE_KEY,
  name: "Sovereign Debt Wave",
  phases: {
    onset: {
      label: "Bond jitters",
      summary: "Lenders are demanding higher rates from heavily indebted governments.",
      headline: "Investors dump government bonds across indebted economies",
      body: "Borrowing costs are rising for several governments at once and rescue talk has started.",
    },
    peak: {
      label: "Funding crisis",
      summary: "Governments struggle to roll over debt and banks are taking losses on bonds.",
      headline: "Debt crisis spreads as governments struggle to borrow",
      body: "Bond auctions are failing and banks holding government debt are reporting losses.",
    },
    recovery: {
      label: "Restructuring",
      summary: "Debt deals and rescue programmes are steadying markets.",
      headline: "Rescue programmes calm sovereign bond markets",
      body: "Lenders have agreed terms and borrowing costs are easing, with austerity still to come.",
    },
    rested: {
      label: "Markets calm",
      summary: "The wave has passed. Budgets are tighter and lenders remain wary.",
      headline: "Sovereign bond markets return to calm",
      body: "Spreads have narrowed. Governments can still decide how much risk to carry into the next downturn.",
    },
  },
  decision: {
    title: "Lenders are turning away",
    description:
      "Bond markets are pricing in a default. The government must decide how to protect its borrowing.",
  },
  levers: {
    contain: {
      id: "contagion_firewall",
      label: "Join a contagion firewall",
      description:
        "Pool guarantees with partners so a failed auction in one country does not spread.",
      costPctGdp: 0.003,
    },
    soften: {
      id: "international_facility",
      label: "Apply for an emergency lending facility",
      description: "Take international emergency loans in return for a reform programme.",
      costPctGdp: 0.001,
    },
    adapt: {
      id: "debt_restructuring",
      label: "Restructure the debt",
      description: "Negotiate longer terms and lower payments with lenders.",
      costPctGdp: 0.002,
    },
  },
  doNothing: {
    id: "hold_the_line",
    label: "Hold the line",
    description: "Keep paying on schedule and hope markets settle.",
  },
  outcomes: {
    contained: {
      label: "Contagion stopped",
      description: "A shared firewall convinces lenders the problem stays in one place.",
      wire: "A contagion firewall stops a sovereign debt scare from spreading.",
    },
    softened: {
      label: "Emergency funding",
      description: "Emergency loans keep the government paying its bills.",
      wire: "An emergency facility keeps indebted governments funded.",
    },
    adapted: {
      label: "Debt restructured",
      description: "Lenders accept new terms and the debt becomes manageable.",
      wire: "Lenders agree a restructuring of sovereign debt.",
    },
    unchecked: {
      onsetWire: "Rising borrowing costs squeeze indebted governments.",
      peakWire: "Failed bond auctions deepen a sovereign debt crisis.",
      description: "With no plan, lenders push borrowing costs higher.",
    },
    aftermath: {
      label: "Fiscal rules locked in",
      description: "New borrowing limits and shared backstops are written into law.",
      wire: "Governments agree lasting debt rules after a sovereign crisis.",
    },
  },
  effects: [
    { category: "economy", field: "gdpGrowth", swing: -0.008, label: "Credit squeeze" },
    { category: "economy", field: "consumerConfidence", swing: -0.015, label: "Fear for savings" },
    { category: "economic", field: "unemploymentRate", swing: 0.003, label: "Austerity layoffs" },
  ],
  approvalSwing: -0.012,
});
