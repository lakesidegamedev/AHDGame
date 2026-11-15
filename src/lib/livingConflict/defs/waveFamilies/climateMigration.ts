import { CLIMATE_MIGRATION_KEY } from "../../rules/waveFamilyTables";
import { buildWaveFamilyDef } from "../waveFamilyFactory";

/** Drought and floods push people across borders faster than towns can absorb them. */
export const CLIMATE_MIGRATION_DEF = buildWaveFamilyDef({
  key: CLIMATE_MIGRATION_KEY,
  name: "Climate Migration Surge",
  phases: {
    onset: {
      label: "Arrivals rising",
      summary: "Families fleeing drought and flooded land are arriving in growing numbers.",
      headline: "Climate disasters send growing numbers across the border",
      body: "Reception centres are filling and local councils are asking the government for help.",
    },
    peak: {
      label: "Strain",
      summary: "Housing, schools and job centres are stretched and politics is turning sharp.",
      headline: "Arrivals strain housing and public services",
      body: "Rents are climbing in the towns taking most arrivals and anti-migration campaigns are gaining ground.",
    },
    recovery: {
      label: "Settling",
      summary: "Arrivals are slowing and newcomers are finding work and homes.",
      headline: "Arrivals slow as newcomers settle into work",
      body: "Reception pressure is easing and councils are catching up on housing and schooling.",
    },
    rested: {
      label: "Steady",
      summary: "The surge has passed. How well newcomers were integrated will show for years.",
      headline: "Climate migration returns to steady levels",
      body: "Border arrivals are back to normal. Governments can still decide how much to invest in integration.",
    },
  },
  decision: {
    title: "People are arriving faster than towns can cope",
    description:
      "Climate disasters are driving a surge of arrivals. The government must decide how to manage it.",
  },
  levers: {
    contain: {
      id: "orderly_border_policy",
      label: "Set an orderly border policy",
      description: "Agree quotas, processing hubs and return arrangements with neighbours.",
      costPctGdp: 0.002,
    },
    soften: {
      id: "reception_funding",
      label: "Fund reception and housing",
      description: "Pay councils for reception centres, temporary homes and school places.",
      costPctGdp: 0.004,
    },
    adapt: {
      id: "integration_funding",
      label: "Fund integration and work permits",
      description: "Speed up work permits, language classes and credential recognition.",
      costPctGdp: 0.003,
    },
  },
  doNothing: {
    id: "leave_to_localities",
    label: "Leave it to localities",
    description: "Let local authorities cope with their own arrivals.",
  },
  outcomes: {
    contained: {
      label: "Flows managed",
      description: "Agreements with neighbours spread arrivals and slow the surge.",
      wire: "Border agreements spread out arrivals from climate disasters.",
    },
    softened: {
      label: "Towns supported",
      description: "Funded reception keeps housing and schools from buckling.",
      wire: "Reception funding eases pressure on towns taking in climate migrants.",
    },
    adapted: {
      label: "Newcomers working",
      description: "Faster work permits turn arrivals into taxpayers.",
      wire: "Faster work permits help climate migrants find jobs.",
    },
    unchecked: {
      onsetWire: "Arrivals from climate disasters keep rising.",
      peakWire: "Housing and services strain under climate migration.",
      description: "Without help, towns are left to cope alone.",
    },
    aftermath: {
      label: "Integration locked in",
      description: "Standing integration funding is written into the budget.",
      wire: "Governments fund lasting integration after a migration surge.",
    },
  },
  effects: [
    {
      category: "social",
      field: "socialCohesion",
      swing: -0.02,
      label: "Tension over housing and services",
    },
    {
      category: "economic",
      field: "unemploymentRate",
      swing: 0.003,
      label: "Job competition at the margins",
    },
    { category: "society", field: "democraticHealth", swing: -0.01, label: "Polarised politics" },
  ],
  approvalSwing: -0.01,
});
