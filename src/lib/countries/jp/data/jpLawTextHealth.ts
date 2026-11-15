import type { JpLawText } from "./jpLawTextTypes";

export const JP_LAW_TEXT_HEALTH: Record<string, JpLawText> = {
  "health.universalCare.primary": [
    "National Health Insurance Coverage Act",
    "Care for everyone through mandatory insurance with fixed fees.",
    4,
    [
      ["No National Service", "Care is bought by whoever can pay."],
      ["Basic Coverage", "Insurance covers the largest firms and public servants."],
      ["Mandatory Insurance", "Everyone must belong to an insurance society or the local scheme."],
      [
        "Broad Public Service",
        "A national fee schedule and low co-payments cover nearly all care.",
      ],
      ["Universal Comprehensive Service", "Every treatment is covered for every resident."],
    ],
  ],
  "health.socialInsurance.primary": [
    "Pension and Long-Term Care Insurance Act",
    "The contributory pension, employment and long-term care insurance system.",
    4,
    [
      ["No Social Insurance", "Old age and sickness are a private matter."],
      ["Foundation Insurance", "A basic pension covers salaried workers."],
      ["Expanded Insurance", "A basic pension reaches the self-employed and part-time workers."],
      ["Full Contributory System", "Two-tier pensions and care insurance cover every worker."],
      [
        "Full Social Insurance",
        "Pensions, care and unemployment cover are comprehensive and generous.",
      ],
    ],
  ],
  "health.prevention.primary": [
    "Public Health Centres and Prevention Act",
    "Vaccination, screening and the public health centres.",
    3,
    [
      ["No Programme", "Prevention is left to doctors and families."],
      ["Public Health Centres", "Local centres monitor outbreaks."],
      [
        "Vaccination and Screening",
        "Regular vaccination drives and workplace health checks are funded.",
      ],
      ["Preventive Network", "A network of clinics, checks and campaigns reaches every town."],
      [
        "Total Prevention System",
        "Screening, vaccination and lifestyle programmes cover the whole population.",
      ],
    ],
  ],
  "health.outcomes.primary": [
    "Hospital Quality and Medical Progress Act",
    "Hospital standards and the push against the leading causes of death.",
    3,
    [
      ["No Investment", "Hospitals pursue quality as they see fit."],
      ["Hospital Planning", "Prefectures plan hospital beds and specialties."],
      ["Quality Reporting", "Hospitals report outcomes and are compared openly."],
      ["National Health Campaign", "National plans target cancer, stroke and heart disease."],
      ["Outcomes Guarantee", "Every patient may expect the best outcomes the system can give."],
    ],
  ],
  "health.responsibility.primary": [
    "Co-payments and Benefit Conditions Act",
    "Patient charges and the conditions attached to benefits.",
    3,
    [
      ["No Conditions", "Care and benefits are free of conditions."],
      ["Modest Charges", "Small co-payments apply to visits and drugs."],
      ["Targeting Regime", "Charges rise with income and fall for the poorest."],
      [
        "Work Requirements",
        "Sickness and livelihood benefits are tied to efforts to return to work.",
      ],
      ["Strict Conditionality", "Benefits are tightly conditioned and heavily checked."],
    ],
  ],
  "health.providerChoice.primary": [
    "Medical Institutions and Provider Choice Act",
    "Private clinics, private hospitals and patients' freedom to choose.",
    4,
    [
      ["No Framework", "Patients go where the state sends them."],
      ["Private Practice", "Doctors may open private clinics under a licence."],
      ["Dual System", "Private and public hospitals both take insured patients."],
      ["Choice Protections", "Patients may visit any clinic or hospital without a referral."],
      ["Open Market Charter", "Providers compete freely and patients choose with ease."],
    ],
  ],
  "health.systemEfficiency.primary": [
    "Medical Cost Efficiency Act",
    "Fee reviews and reforms aimed at waste in hospitals and pharmacies.",
    3,
    [
      ["No Programme", "Costs are left alone."],
      ["Cost Reporting", "Hospitals report costs and drug prices."],
      ["Efficiency Review", "Biennial fee reviews trim excess and favour generics."],
      ["Performance Funding", "Payments reward results rather than volume."],
      ["Lean Service Mandate", "Every yen is traced and waste is cut hard."],
    ],
  ],
  "sec.pensionCoverageExtension": [
    "Pension Coverage Extension Act",
    "Regular adjustment and extension of pension coverage to more people.",
    3,
    [
      ["No Extension", "Pension coverage stays as it is."],
      ["Coverage Extension", "Part-time workers join the employee pension."],
      ["Benefit Adjustment", "Benefits are adjusted for prices and longer lives."],
      ["Broad Extension", "Almost every worker and homemaker is covered."],
      ["Universal Adequacy Drive", "Every retiree is assured a decent income."],
    ],
  ],
  "sec.hospitalInvestment": [
    "Hospital Investment Act",
    "National and prefectural money for new wards, equipment and digital records.",
    3,
    [
      ["No Programme", "Hospitals raise their own capital."],
      ["Repairs and Extensions", "Grants fund repairs and new wings."],
      ["Investment Programme", "A steady fund buys equipment and digital systems."],
      ["Regional Hospital Plan", "Prefectural plans place hospitals where need is greatest."],
      ["Universal Standard", "Every region holds a modern hospital within easy reach."],
    ],
  ],
  "sec.workInjuryAndWarVictimsCare": [
    "Work Injury and War Victims Care Act",
    "Workers' accident compensation and care for those hurt at work or in service.",
    3,
    [
      ["No Programmes", "Injured workers rely on employers' goodwill."],
      ["Accident Insurance", "Employers insure workers against injury."],
      ["Insurance and Treatment", "Insurance pays for treatment and rehabilitation."],
      ["Expanded Care System", "Long-term care and pensions extend to the severely disabled."],
      ["Full Guarantee", "Every injured worker and veteran is fully cared for."],
    ],
  ],
  "sec.medicalResearch": [
    "Medical Research Funding Act",
    "Research units on disease, from clinical trials to public health studies.",
    3,
    [
      ["No Council", "Research is left to universities and firms."],
      ["Research Units", "Units study single diseases."],
      ["Research Council", "A council sets priorities and funds trials."],
      ["Disease Missions", "Long programmes aim at cancer, dementia and rare disease."],
      ["Conquest of Disease Drive", "The state commits to defeating the great diseases."],
    ],
  ],
  "sec.insuranceSocietyAutonomy": [
    "Health Insurance Society Autonomy Act",
    "The self-governing insurance societies that run benefits alongside the state.",
    3,
    [
      ["No Framework", "The state runs all insurance directly."],
      ["Recognized Societies", "Company and trade societies are recognized."],
      ["Self-Administration", "Societies set premiums and run health programmes."],
      ["Portable Benefits", "Members keep coverage when they change jobs."],
      ["Open Benefits Market", "Societies compete for members freely."],
    ],
  ],
  "sec.benefitConditionality": [
    "Benefit Conditionality Act",
    "Case work, job search duties and the checks behind livelihood support.",
    2,
    [
      ["No Reform", "Benefits are paid with few questions."],
      ["Eligibility Review", "Claims are checked against means and assets."],
      ["Casework Standards", "Caseworkers follow national standards."],
      ["Work-Linked Assistance", "Able claimants must seek work to keep payments."],
      ["Full Conditionality", "Every payment carries duties and checks."],
    ],
  ],
};
