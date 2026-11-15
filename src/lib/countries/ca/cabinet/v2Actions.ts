/**
 * Canadian ministerial initiatives target national game outcomes.
 * CA_RESET_CABINET_ACTIONS defines two operating choices per Cabinet office
 * using the shared charge, cost, duration and cooldown rules.
 */
import type { ResetCabinetAction } from "@/lib/resetCabinet/catalog";
import { primaryMetricById } from "@/lib/resetMetrics/catalog";
import { actionSecondaryTarget } from "@/lib/resetCabinet/secondaryTargets";

type Choice = readonly [target: string, title: string, brief: string];
const offices: readonly (readonly [seatId: string, Choice, Choice])[] = [
  [
    "deputy_prime_minister",
    [
      "M47",
      "Publish Cabinet Delivery Commitments",
      "Publish departmental delivery commitments and identify the responsible federal ministers.",
    ],
    [
      "M38",
      "Coordinate Provincial Emergency Liaison",
      "Reconcile federal emergency assignments with provincial and territorial partners.",
    ],
  ],
  [
    "minister_of_finance",
    [
      "M47",
      "Reconcile Fiscal Disclosures",
      "Reconcile federal fiscal disclosures and publish the reasons for material forecast differences.",
    ],
    [
      "S:governmentApproval",
      "Review Taxpayer Service Standards",
      "Review unresolved taxpayer service complaints and publish accountable response commitments.",
    ],
  ],
  [
    "minister_of_foreign_affairs",
    [
      "S:governmentApproval",
      "Review Consular Casework",
      "Review Canadian consular casework and coordinate assistance through Canadian missions.",
    ],
    [
      "M47",
      "Publish Diplomatic Service Commitments",
      "Publish service commitments and reporting responsibilities for Canadian diplomatic missions.",
    ],
  ],
  [
    "minister_of_national_defence",
    [
      "M57",
      "Review Canadian Forces Readiness",
      "Review Canadian Armed Forces maintenance and training schedules within existing appropriations.",
    ],
    [
      "M38",
      "Coordinate Domestic Assistance Readiness",
      "Reconcile military assistance arrangements with civilian emergency authorities.",
    ],
  ],
  [
    "minister_of_justice",
    [
      "M47",
      "Publish Charter Compliance Reviews",
      "Review federal administrative procedures for Charter compliance without directing independent courts.",
    ],
    [
      "M48",
      "Audit Federal Justice Procurement",
      "Audit federal justice procurement and refer identified conflicts through lawful oversight channels.",
    ],
  ],
  [
    "minister_of_public_safety",
    [
      "M38",
      "Exercise Federal Emergency Coordination",
      "Exercise federal emergency coordination with provincial and territorial public-safety authorities.",
    ],
    [
      "S:borderSecurity",
      "Review Border Casework Delivery",
      "Review lawful border casework and coordinate outstanding service assignments with responsible agencies.",
    ],
  ],
  [
    "minister_of_industry",
    [
      "S:roboticsAdoption",
      "Review Canadian Technology Partnerships",
      "Review federally supported technology adoption partnerships and reconcile deployment milestones.",
    ],
    [
      "M13",
      "Coordinate Industry Skills Services",
      "Coordinate industry skills and technology-adoption training with Canadian employers.",
    ],
  ],
  [
    "minister_of_international_trade",
    [
      "S:tradeGrowth",
      "Review Exporter Service Delivery",
      "Review Canadian exporter assistance and reconcile outstanding market-access service requests.",
    ],
    [
      "M47",
      "Publish Trade Service Casework",
      "Publish non-confidential trade service casework and identify accountable federal delivery teams.",
    ],
  ],
  [
    "minister_of_labour",
    [
      "M13",
      "Coordinate Federal Skills Delivery",
      "Coordinate federally funded skills delivery with employers, provinces and territories.",
    ],
    [
      "M01",
      "Review Employment Access Services",
      "Review access barriers in federal employment services while respecting provincial labour jurisdiction.",
    ],
  ],
  [
    "minister_of_natural_resources",
    [
      "M58",
      "Review Canadian Fuel Contingencies",
      "Review Canadian fuel-supply contingency plans without inventing or purchasing emergency reserves.",
    ],
    [
      "M30",
      "Coordinate Clean Energy Project Reviews",
      "Coordinate existing federal clean-energy project reviews with provincial resource authorities.",
    ],
  ],
  [
    "minister_of_health",
    [
      "M23",
      "Coordinate Public Health Readiness",
      "Coordinate federal public-health readiness with provincial and territorial health authorities.",
    ],
    [
      "M18",
      "Review Health Transfer Delivery",
      "Review health-transfer reporting and access commitments without directing provincial clinical services.",
    ],
  ],
  [
    "minister_of_education_and_skills",
    [
      "M13",
      "Reconcile Skills Funding Agreements",
      "Reconcile federal skills funding agreements with provincial and territorial delivery partners.",
    ],
    [
      "M11",
      "Review Student Assistance Delivery",
      "Review federal student assistance delivery without rewriting provincial education law or curricula.",
    ],
  ],
  [
    "minister_of_housing",
    [
      "M25",
      "Coordinate Housing Agreement Milestones",
      "Coordinate federally funded housing milestones with provincial, territorial and municipal partners.",
    ],
    [
      "M41",
      "Review Homelessness Service Agreements",
      "Review federal homelessness service agreements and reconcile outstanding delivery commitments.",
    ],
  ],
  [
    "minister_of_infrastructure",
    [
      "M26",
      "Review Infrastructure Project Delivery",
      "Review federally supported road and bridge projects with the authorities responsible for delivery.",
    ],
    [
      "M27",
      "Coordinate Transit Funding Agreements",
      "Coordinate transit funding milestones with provincial and municipal service operators.",
    ],
  ],
  [
    "minister_of_agriculture",
    [
      "M42",
      "Review Canadian Food Supply Plans",
      "Review Canadian food-supply contingency plans with provincial agriculture authorities.",
    ],
    [
      "M39",
      "Coordinate Agricultural Conservation Services",
      "Coordinate existing agricultural conservation services and their reported environmental commitments.",
    ],
  ],
  [
    "minister_of_environment",
    [
      "M35",
      "Review Federal Air Quality Delivery",
      "Review federal air-quality responsibilities alongside provincial monitoring and enforcement partners.",
    ],
    [
      "M38",
      "Coordinate Climate Adaptation Agreements",
      "Coordinate federally supported climate-adaptation milestones with provinces and territories.",
    ],
  ],
  [
    "minister_of_intergovernmental_affairs",
    [
      "M43",
      "Publish Intergovernmental Commitments",
      "Publish federal, provincial and territorial delivery commitments without transferring constitutional powers.",
    ],
    [
      "M47",
      "Reconcile Transfer Reporting",
      "Reconcile intergovernmental reporting responsibilities and publish unresolved delivery assignments.",
    ],
  ],
  [
    "government_house_leader",
    [
      "S:partyDiscipline",
      "Coordinate Government Parliamentary Business",
      "Coordinate government parliamentary business without replacing votes or confidence requirements.",
    ],
    [
      "M47",
      "Publish Parliamentary Delivery Timetable",
      "Publish accountable parliamentary delivery timetables and the status of government commitments.",
    ],
  ],
  [
    "director_of_intelligence",
    [
      "M47",
      "Review Intelligence Oversight Reporting",
      "Review lawful intelligence oversight reporting without disclosing operations or directing independent review bodies.",
    ],
    [
      "M38",
      "Review Emergency Intelligence Liaison",
      "Review documented intelligence liaison responsibilities supporting civilian emergency preparedness.",
    ],
  ],
];

/** Canadian administrative mechanisms use the established shared v2 cost and duration rules. */
export const CA_RESET_CABINET_ACTIONS: readonly ResetCabinetAction[] = offices.flatMap(
  ([seatId, ...choices]) =>
    choices.map(([target, title, brief], index) => ({
      id: `CA:${seatId}:${index + 1}`,
      country: "CA" as const,
      seatId,
      slot: index + 1,
      title,
      target,
      targetNames: [
        target.startsWith("M")
          ? primaryMetricById(target.slice(1))!.name
          : actionSecondaryTarget(target)!.label,
      ],
      strength: 0.14,
      costClass: "Ops" as const,
      scope: "Nat" as const,
      brief,
      description: `${brief} Uses the office's existing legal authority and the shared v2 ministerial charge, operating-cost, duration and cooldown rules. It creates no new legislation, revenue, resource stock or constitutional power.`,
    }))
);
