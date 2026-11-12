import { ANTIMICROBIAL_RESISTANCE_KEY } from "../../rules/waveFamilyTables";
import { buildWaveFamilyDef } from "../waveFamilyFactory";

/** Overused antibiotics stop working and routine infections turn deadly. */
export const ANTIMICROBIAL_RESISTANCE_DEF = buildWaveFamilyDef({
  key: ANTIMICROBIAL_RESISTANCE_KEY,
  name: "Antimicrobial Resistance",
  phases: {
    onset: {
      label: "Drugs failing",
      summary: "Common antibiotics are failing against infections in hospitals.",
      headline: "Doctors report common antibiotics failing",
      body: "Hospital infections that used to clear in days are lingering and spreading between wards.",
    },
    peak: {
      label: "Untreatable infections",
      summary: "Routine surgery and childbirth carry new risks as infections resist treatment.",
      headline: "Untreatable infections spread through hospitals",
      body: "Surgeons are postponing operations and deaths from ordinary infections are rising.",
    },
    recovery: {
      label: "New treatments",
      summary: "Stewardship rules and new drugs are bringing infections back under control.",
      headline: "New drugs and stricter use bring infections down",
      body: "Hospitals are resuming surgery and resistant infections are falling.",
    },
    rested: {
      label: "Contained",
      summary: "The crisis has eased. Drug stewardship decides how long the gains last.",
      headline: "Resistant infections fall to manageable levels",
      body: "Hospitals report fewer resistant cases. Governments can still decide how much to invest in research.",
    },
  },
  decision: {
    title: "Antibiotics are failing",
    description: "Resistant infections are spreading. The government must decide how to respond.",
  },
  levers: {
    contain: {
      id: "stewardship_law",
      label: "Pass a drug stewardship law",
      description:
        "Limit antibiotic use in medicine and farming and require hospital hygiene plans.",
      costPctGdp: 0.001,
    },
    soften: {
      id: "hospital_infection_control",
      label: "Fund hospital infection control",
      description:
        "Pay for isolation wards, testing and cleaning to limit spread inside hospitals.",
      costPctGdp: 0.003,
    },
    adapt: {
      id: "antibiotic_research",
      label: "Fund new antibiotic research",
      description: "Pay drug developers a guaranteed price for new antibiotics.",
      costPctGdp: 0.003,
    },
  },
  doNothing: {
    id: "leave_to_the_market",
    label: "Leave it to the market",
    description: "Rely on drug makers and hospitals to adapt.",
  },
  outcomes: {
    contained: {
      label: "Use restricted",
      description: "Stricter use slows the spread of resistance.",
      wire: "A stewardship law slows the spread of drug-resistant infections.",
    },
    softened: {
      label: "Wards protected",
      description: "Isolation and testing keep infections inside fewer wards.",
      wire: "Infection control protects hospital wards from resistant infections.",
    },
    adapted: {
      label: "New drugs funded",
      description: "A guaranteed price brings new antibiotics to market.",
      wire: "Guaranteed prices bring new antibiotics to market.",
    },
    unchecked: {
      onsetWire: "Hospitals report antibiotics failing against common infections.",
      peakWire: "Untreatable infections spread through hospitals.",
      description: "Without action, resistance keeps growing.",
    },
    aftermath: {
      label: "Stewardship locked in",
      description: "Standing rules on antibiotic use and research funding are set.",
      wire: "Governments set lasting antibiotic stewardship rules.",
    },
  },
  effects: [
    {
      category: "society",
      field: "publicHealth",
      swing: -0.025,
      label: "Deaths from resistant infections",
    },
    {
      category: "economy",
      field: "gdpGrowth",
      swing: -0.003,
      label: "Postponed surgery and lost workdays",
    },
    { category: "economy", field: "consumerConfidence", swing: -0.01, label: "Fear of hospitals" },
  ],
  approvalSwing: -0.01,
});
