/**
 * UK Judicial Review surprise templates.
 *
 * Real `uk_*` mild option ends (opt_1 left / opt_5 right). Dual effects so a
 * proxy court lean can land either way.
 */
export type JrCaseAxis = "economic" | "social";

export interface JrCaseEffect {
  legislationTypeId: string;
  policyOptionId: string;
  effectDirection: -1 | 0 | 1;
}

export interface JrSurpriseTemplate {
  templateKey: string;
  title: string;
  axis: JrCaseAxis;
  /** Fires when proxy court lean is right-leaning (positive). */
  positiveEffect: JrCaseEffect;
  /** Fires when proxy court lean is left-leaning (negative). */
  negativeEffect: JrCaseEffect;
}

export const UK_JR_SURPRISE_TEMPLATES: JrSurpriseTemplate[] = [
  {
    templateKey: "r-save-the-marshes-v-secretary-of-state-for-environment",
    title: "R (Save the Marshes) v Secretary of State for Environment",
    axis: "economic",
    positiveEffect: {
      legislationTypeId: "uk.environment.conservation.primary",
      policyOptionId: "l0",
      effectDirection: -1,
    },
    negativeEffect: {
      legislationTypeId: "uk.environment.conservation.primary",
      policyOptionId: "l4",
      effectDirection: 1,
    },
  },
  {
    templateKey: "r-north-sea-wind-leaseholders-v-crown-estate",
    title: "R (North Sea Wind Leaseholders) v Crown Estate Commissioners",
    axis: "economic",
    positiveEffect: {
      legislationTypeId: "uk.infrastructure.transit.primary",
      policyOptionId: "l0",
      effectDirection: -1,
    },
    negativeEffect: {
      legislationTypeId: "uk.infrastructure.transit.primary",
      policyOptionId: "l4",
      effectDirection: 1,
    },
  },
  {
    templateKey: "r-patient-voices-alliance-v-secretary-of-state-for-health",
    title: "R (Patient Voices Alliance) v Secretary of State for Health",
    axis: "economic",
    positiveEffect: {
      legislationTypeId: "uk.health.universalCare.primary",
      policyOptionId: "l0",
      effectDirection: -1,
    },
    negativeEffect: {
      legislationTypeId: "uk.health.universalCare.primary",
      policyOptionId: "l4",
      effectDirection: 1,
    },
  },
  {
    templateKey: "r-channel-watch-v-home-secretary",
    title: "R (Channel Watch) v Secretary of State for the Home Department",
    axis: "social",
    positiveEffect: {
      legislationTypeId: "uk.sec.nationalityMigration",
      policyOptionId: "l0",
      effectDirection: -1,
    },
    negativeEffect: {
      legislationTypeId: "uk.sec.nationalityMigration",
      policyOptionId: "l4",
      effectDirection: 1,
    },
  },
  {
    templateKey: "r-licence-fee-payers-v-bbc",
    title: "R (Licence Fee Payers Association) v British Broadcasting Corporation",
    axis: "social",
    positiveEffect: {
      legislationTypeId: "uk.sec.broadcastingCharter",
      policyOptionId: "l0",
      effectDirection: -1,
    },
    negativeEffect: {
      legislationTypeId: "uk.sec.broadcastingCharter",
      policyOptionId: "l4",
      effectDirection: 1,
    },
  },
  {
    templateKey: "r-trident-watch-v-secretary-of-state-for-defence",
    title: "R (Trident Watch) v Secretary of State for Defence",
    axis: "economic",
    // Trident ladder is inverted vs most uk_* types (right/renewal = +1).
    positiveEffect: {
      legislationTypeId: "uk.defense.projection.primary",
      policyOptionId: "l4",
      effectDirection: 1,
    },
    negativeEffect: {
      legislationTypeId: "uk.defense.projection.primary",
      policyOptionId: "l0",
      effectDirection: -1,
    },
  },
  {
    templateKey: "r-fair-votes-uk-v-speaker-of-the-commons",
    title: "R (Fair Votes UK) v Speaker of the House of Commons",
    axis: "social",
    positiveEffect: {
      legislationTypeId: "uk.governance.participation.primary",
      policyOptionId: "l0",
      effectDirection: -1,
    },
    negativeEffect: {
      legislationTypeId: "uk.governance.participation.primary",
      policyOptionId: "l4",
      effectDirection: 1,
    },
  },
  {
    templateKey: "in-re-commuter-rail-timetable-v-dft",
    title: "In re Commuter Rail Timetable Challenge v Department for Transport",
    axis: "economic",
    positiveEffect: {
      legislationTypeId: "uk.infrastructure.transit.primary",
      policyOptionId: "l0",
      effectDirection: -1,
    },
    negativeEffect: {
      legislationTypeId: "uk.infrastructure.transit.primary",
      policyOptionId: "l4",
      effectDirection: 1,
    },
  },
];
