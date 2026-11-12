import { SECOND_PANDEMIC_KEY } from "../../rules/waveFamilyTables";
import { buildWaveFamilyDef } from "../waveFamilyFactory";

/** A new pathogen, likelier where public health is thin and cities are dense. */
export const SECOND_PANDEMIC_DEF = buildWaveFamilyDef({
  key: SECOND_PANDEMIC_KEY,
  name: "Second Pandemic",
  phases: {
    onset: {
      label: "Novel outbreak",
      summary: "A new pathogen is spreading between cities before anyone knows how deadly it is.",
      headline: "Health agencies confirm a new fast-spreading illness",
      body: "Clusters of severe cases are appearing in major cities. Hospitals are asking for guidance and travel is still open.",
    },
    peak: {
      label: "Surge",
      summary: "Hospitals are overwhelmed and businesses are closing their doors.",
      headline: "Hospitals overwhelmed as the new illness surges",
      body: "Deaths are climbing above normal and staff are falling sick. Output is falling as workplaces shut.",
    },
    recovery: {
      label: "Recovery",
      summary: "Treatments and immunity are bringing cases down and services are reopening.",
      headline: "Cases fall as treatments and immunity take hold",
      body: "Hospitals are clearing their backlogs and the economy is reopening, with the bills still to pay.",
    },
    rested: {
      label: "Over for now",
      summary: "The outbreak has ended. Preparedness decisions made now shape the next one.",
      headline: "The new illness is declared under control",
      body: "Health agencies stand down emergency measures. Governments can still decide how much to invest in readiness.",
    },
  },
  decision: {
    title: "A new illness is spreading",
    description:
      "Officials do not yet know how deadly it is. The government must decide how to respond.",
  },
  levers: {
    contain: {
      id: "border_measures",
      label: "Order border and travel measures",
      description: "Screen and limit travel from affected regions to slow the spread early.",
      costPctGdp: 0.002,
    },
    soften: {
      id: "preparedness_spending",
      label: "Fund hospital surge capacity",
      description: "Pay for beds, staff and supplies so hospitals cope with the peak.",
      costPctGdp: 0.004,
    },
    adapt: {
      id: "vaccine_platform",
      label: "Back a rapid vaccine platform",
      description: "Fund laboratories to design and make a vaccine in months instead of years.",
      costPctGdp: 0.003,
    },
  },
  doNothing: {
    id: "wait_and_see",
    label: "Wait and see",
    description: "Take no new action until the picture is clearer.",
  },
  outcomes: {
    contained: {
      label: "Outbreak contained",
      description: "Early travel measures keep the illness from taking hold.",
      wire: "Travel measures hold back a new illness before it spreads widely.",
    },
    softened: {
      label: "Hospitals cope",
      description: "Extra capacity means fewer deaths and a shorter shutdown.",
      wire: "Extra hospital capacity limits the toll of a new illness.",
    },
    adapted: {
      label: "Vaccine on the way",
      description: "A new vaccine platform speeds up protection for the public.",
      wire: "A rapid vaccine platform shortens a new illness outbreak.",
    },
    unchecked: {
      onsetWire: "A new illness spreads while governments wait for more information.",
      peakWire: "A new illness overwhelms hospitals.",
      description: "Delay lets the illness spread further.",
    },
    aftermath: {
      label: "Readiness locked in",
      description: "Standing stockpiles and surge staff are funded for the future.",
      wire: "Governments fund permanent readiness after a new outbreak.",
    },
  },
  effects: [
    {
      category: "society",
      field: "publicHealth",
      swing: -0.03,
      label: "Excess deaths and illness",
    },
    { category: "economy", field: "gdpGrowth", swing: -0.006, label: "Workplace closures" },
    { category: "economy", field: "consumerConfidence", swing: -0.02, label: "Fear of crowds" },
  ],
  approvalSwing: -0.012,
});
