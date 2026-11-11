import type { CnLawText } from "./cnLawTextTypes";

export const CN_LAW_TEXT_ORDER: Record<string, CnLawText> = {
  "order.dueProcess.primary": [
    "Criminal Procedure and Detention Standards Act",
    "The rules the state must follow before it may hold or charge a person.",
    1,
    [
      ["No Statutory Standards", "Suspects may be held at the authorities' discretion."],
      ["Basic Protections", "Warrants and a limit on detention are required."],
      ["Detention Standards", "Suspects may see a lawyer and interrogations are recorded."],
      [
        "Strong Process Rights",
        "Counsel is present, bail is routine and evidence rules are strict.",
      ],
      ["Full Rights Charter", "Every suspect enjoys the fullest protection of the law."],
    ],
  ],
  "order.legalAid.primary": [
    "Legal Aid Act",
    "The scheme that puts a lawyer within reach of people on low incomes.",
    1,
    [
      ["No Legal Aid", "Lawyers are for those who can pay."],
      ["Advice Counters", "Public counters offer free first advice."],
      ["Legal Aid Scheme", "Legal aid centres fund lawyers for low income clients."],
      ["Access Guarantee", "Legal aid is available in every county."],
      ["Universal Legal Service", "Every resident may have a lawyer at public expense."],
    ],
  ],
  "order.communityTrust.primary": [
    "Police Accountability Act",
    "Oversight bodies and codes that keep officers answerable.",
    2,
    [
      ["No Oversight", "Police police themselves."],
      ["Complaint Offices", "Public security bureaus hear complaints."],
      ["Conduct Standards", "Written codes govern conduct and discipline."],
      ["Accountability Regime", "Independent reviewers investigate serious cases."],
      [
        "Full Community Model",
        "Neighbourhood stations, open reviews and joint patrols build trust.",
      ],
    ],
  ],
  "order.safety.primary": [
    "Social Order and Crime Prevention Act",
    "Money aimed at stopping crime before the police are needed.",
    3,
    [
      ["No Programmes", "Crime is a matter for the police alone."],
      ["Targeted Grants", "Grants go to the worst districts."],
      ["Prevention Programme", "Community grid wardens, lighting and youth programmes are funded."],
      ["National Safety Drive", "A national plan coordinates prevention in every district."],
      ["Total Safety Guarantee", "Every community is made safe by design."],
    ],
  ],
  "order.courts.primary": [
    "Court Capacity and Judiciary Act",
    "Judges, staff and courtrooms enough to clear the lists.",
    2,
    [
      ["Starved Courts", "Cases wait for years."],
      ["Judicial Appointments", "More judges are appointed."],
      ["Court Modernization", "Digital filing and case management speed up hearings."],
      ["Speedy Trial Standard", "Trials must be heard within set time limits."],
      ["Full Capacity Guarantee", "Courts always have room for the next case."],
    ],
  ],
  "order.policeStrength.primary": [
    "People's Police Act",
    "The strength and equipment of the public security forces.",
    3,
    [
      ["Skeleton Forces", "Localities keep few officers."],
      ["Establishment Funding", "Officer numbers are funded to a standard."],
      ["Modern Police", "Equipment, forensics and training are modernized."],
      ["National Enforcement Web", "The ministry coordinates every province."],
      ["Maximum Enforcement", "Officers are everywhere and equipped for anything."],
    ],
  ],
  "order.deterrence.primary": [
    "Sentencing and Prisons Act",
    "How heavily the scales come down and where the convicted go.",
    3,
    [
      ["No Policy", "Sentencing follows custom."],
      ["Prison Standards", "Prisons follow written standards."],
      ["Firm Sentencing", "Guidelines set firm sentences for serious crime."],
      ["Severe Regime", "Long sentences and strict regimes apply."],
      ["Maximum Deterrence", "The heaviest penalties apply to every serious offence."],
    ],
  ],
  "sec.justiceAdministration": [
    "Justice Administration Act",
    "Running the courts as a service for the people who use them.",
    3,
    [
      ["No Programme", "Courts run themselves."],
      ["Court Administration", "Clerks and administrators manage the lists."],
      ["Justice Administration", "A justice ministry sets service standards."],
      ["Expanded Access Programme", "Court services reach every county, online and in person."],
      ["Model Justice System", "Courts are fast, close and easy to use."],
    ],
  ],
  "sec.prisonAndYouthJustice": [
    "Prison and Youth Justice Act",
    "Youth custody and the argument over what prison is for.",
    3,
    [
      ["No Reform", "Prisons and youth institutions stay as they are."],
      ["Basic Standards", "Minimum standards are written down."],
      ["Rehabilitation System", "Work, study and counselling prepare inmates for release."],
      ["Modern Corrections", "Juvenile institutions and community correction are modernized."],
      ["Model Corrections System", "Every sentence ends with a plan for return to society."],
    ],
  ],
  "sec.domesticIntelligence": [
    "State Security Act",
    "The state security service's reach into extremism and organized crime.",
    3,
    [
      ["No Expansion", "The service stays small."],
      ["Regional Offices", "Regional offices gather information."],
      ["Service Expansion", "More analysts and wider powers follow."],
      ["National Coordination", "The service works closely with the police and other agencies."],
      ["Saturation Coverage", "Nearly every threat is watched."],
    ],
  ],
  "sec.emergencyManagement": [
    "Emergency Management Act",
    "Warning systems, shelters and disaster relief for floods, quakes and epidemics.",
    3,
    [
      ["No Service", "Disasters are met with improvisation."],
      ["Warning Systems", "Alerts and sirens warn residents."],
      ["Emergency Response Service", "Trained teams and stockpiles are kept ready."],
      ["Shelter and Continuity", "Shelters and backup services are built across the country."],
      ["Total Preparedness", "Every community drills regularly and is ready for the worst."],
    ],
  ],
};
