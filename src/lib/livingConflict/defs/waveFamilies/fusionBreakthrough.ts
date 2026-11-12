import { FUSION_BREAKTHROUGH_KEY } from "../../rules/waveFamilyTables";
import { buildWaveFamilyDef } from "../waveFamilyFactory";

/** Good news: a research-heavy country proves fusion power. Policy decides how fast it spreads. */
export const FUSION_BREAKTHROUGH_DEF = buildWaveFamilyDef({
  key: FUSION_BREAKTHROUGH_KEY,
  name: "Fusion Breakthrough",
  effectsFromOnset: true,
  severeRoles: [],
  phases: {
    onset: {
      label: "Net energy",
      summary: "A research plant has put out more energy than it took in for a sustained run.",
      headline: "Laboratory fusion plant sustains net power",
      body: "Engineers say a commercial design is possible, but regulators and grid planners have to move first.",
    },
    peak: {
      label: "First plants",
      summary: "The first commercial fusion plants are being licensed and connected.",
      headline: "First commercial fusion plants connect to the grid",
      body: "Power prices are starting to fall in regions with a plant and others are asking how to follow.",
    },
    recovery: {
      label: "Build-out",
      summary: "Utilities are ordering plants and old fuel contracts are being unwound.",
      headline: "Utilities order fusion plants at scale",
      body: "Construction crews are busy and gas and coal contracts are being renegotiated.",
    },
    rested: {
      label: "Mature industry",
      summary: "Fusion is a normal part of the power mix. Further growth follows ordinary demand.",
      headline: "Fusion becomes an ordinary part of the power supply",
      body: "Supply chains are settled. Governments can still decide how much to back the next generation.",
    },
  },
  decision: {
    title: "A fusion design works",
    description: "A commercial plant is possible. The government must decide how fast to back it.",
  },
  levers: {
    contain: {
      id: "fast_track_licensing",
      label: "Fast-track licensing",
      description: "Create a dedicated licensing route so first plants can be approved in months.",
      costPctGdp: 0.001,
    },
    soften: {
      id: "demonstration_funding",
      label: "Fund demonstration plants",
      description: "Share the cost of the first commercial plants with the builders.",
      costPctGdp: 0.004,
    },
    adapt: {
      id: "grid_build_out",
      label: "Build out grid connections",
      description: "Pay for transmission lines and storage so new plants can deliver power.",
      costPctGdp: 0.003,
    },
  },
  doNothing: {
    id: "wait_for_the_market",
    label: "Wait for the market",
    description: "Let utilities and regulators move at their usual pace.",
  },
  outcomes: {
    contained: {
      label: "Licensed fast",
      description: "A dedicated route gets the first plants online sooner.",
      wire: "A fast-track licensing route brings the first fusion plants online sooner.",
    },
    softened: {
      label: "Demonstrations funded",
      description: "Shared funding gets the first commercial plants built.",
      wire: "Public funding backs the first commercial fusion plants.",
    },
    adapted: {
      label: "Grid ready",
      description: "New lines and storage let plants deliver power where it is needed.",
      wire: "New grid connections prepare the way for fusion power.",
    },
    unchecked: {
      onsetWire: "Fusion designs wait on slow licensing and grid planning.",
      peakWire: "Fusion plants trickle online while paperwork catches up.",
      description: "Without action, the first plants arrive slowly.",
    },
    aftermath: {
      label: "Industry backed",
      description: "Standing support for the next generation of plants is set.",
      wire: "Governments set lasting support for fusion power.",
    },
  },
  effects: [
    { category: "economy", field: "inflation", swing: -0.004, label: "Cheaper power" },
    {
      category: "economy",
      field: "gdpGrowth",
      swing: 0.004,
      label: "Energy-intensive industry expands",
    },
    { category: "economy", field: "consumerConfidence", swing: 0.01, label: "Lower power bills" },
  ],
  approvalSwing: 0.01,
});
