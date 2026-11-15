/**
 * Canada's political-legislation catalog for the 2027 world: 6 tax laws, one
 * primary law per political metric and a pool of secondary laws.
 * Structure (targets, cost and revenue fractions, budget lines) follows the
 * shared catalog topology that the validators enforce; titles, descriptions and
 * level copy are Canadian. Day-one levels are set for Canada's 2027 settings.
 */

import type { PoliticalLaw } from "@/lib/politicalLegislation/types";

export const CA_LAWS: PoliticalLaw[] = [
  {
    id: "ca.tax.incomeTax",
    countryId: "CA",
    kind: "tax",
    targets: [],
    taxPolicy: {
      scope: "federal",
      taxType: "incomeTax",
      minRate: 0,
      maxRate: 60,
      step: 1,
      baselineRate: 26,
      waypoints: [
        {
          rate: 0,
          label: "No Income Tax",
        },
        {
          rate: 14,
          label: "Low Schedule",
        },
        {
          rate: 26,
          label: "Standard Schedule",
        },
        {
          rate: 38,
          label: "High Schedule",
        },
        {
          rate: 50,
          label: "Very High Schedule",
        },
        {
          rate: 60,
          label: "Confiscatory Schedule",
        },
      ],
    },
    title: "Income Tax Act",
    description: "The federal and provincial personal income tax schedule.",
    category: "economy",
    allowedScope: "national",
  },
  {
    id: "ca.tax.domesticCorporateTax",
    countryId: "CA",
    kind: "tax",
    targets: [],
    taxPolicy: {
      scope: "federal",
      taxType: "domesticCorporateTax",
      minRate: 0,
      maxRate: 60,
      step: 1,
      baselineRate: 26,
      waypoints: [
        {
          rate: 0,
          label: "No Profits Tax",
        },
        {
          rate: 12,
          label: "Light Rate",
        },
        {
          rate: 26,
          label: "Standard Rate",
        },
        {
          rate: 40,
          label: "High Rate",
        },
        {
          rate: 55,
          label: "Punitive Rate",
        },
      ],
    },
    title: "Corporate Income Tax Act",
    description: "The combined federal and provincial tax on corporate profits.",
    category: "economy",
    allowedScope: "national",
  },
  {
    id: "ca.tax.foreignCorporateTax",
    countryId: "CA",
    kind: "tax",
    targets: [],
    taxPolicy: {
      scope: "federal",
      taxType: "foreignCorporateTax",
      minRate: 0,
      maxRate: 65,
      step: 1,
      baselineRate: 26,
      waypoints: [
        {
          rate: 0,
          label: "Exempt Foreign Firms",
        },
        {
          rate: 14,
          label: "Light Rate",
        },
        {
          rate: 26,
          label: "Standard Rate",
        },
        {
          rate: 42,
          label: "High Rate",
        },
        {
          rate: 58,
          label: "Punitive Rate",
        },
      ],
    },
    title: "Non-Resident Corporation Tax Act",
    description: "Tax on the Canadian profits of foreign-owned firms.",
    category: "economy",
    allowedScope: "national",
  },
  {
    id: "ca.tax.payrollTax",
    countryId: "CA",
    kind: "tax",
    targets: [],
    taxPolicy: {
      scope: "federal",
      taxType: "payrollTax",
      minRate: 0,
      maxRate: 20,
      step: 0.2,
      baselineRate: 9.8,
      waypoints: [
        {
          rate: 0,
          label: "No Contributions",
        },
        {
          rate: 3.6,
          label: "Minimal Contributions",
        },
        {
          rate: 9.8,
          label: "Standard Contributions",
        },
        {
          rate: 14,
          label: "Expanded Contributions",
        },
        {
          rate: 18,
          label: "Comprehensive Contributions",
        },
      ],
    },
    title: "Pension and Employment Insurance Contributions Act",
    description: "Payroll contributions that fund pensions and employment insurance.",
    category: "economy",
    allowedScope: "national",
  },
  {
    id: "ca.tax.salesTax",
    countryId: "CA",
    kind: "tax",
    targets: [],
    taxPolicy: {
      scope: "federal",
      taxType: "salesTax",
      minRate: 0,
      maxRate: 30,
      step: 1,
      baselineRate: 9,
      waypoints: [
        {
          rate: 0,
          label: "No Sales Tax",
        },
        {
          rate: 5,
          label: "Low Rate",
        },
        {
          rate: 9,
          label: "Standard Rate",
        },
        {
          rate: 15,
          label: "High Rate",
        },
        {
          rate: 25,
          label: "Very High Rate",
        },
      ],
    },
    title: "Goods and Services Tax Act",
    description: "The federal and provincial sales taxes on goods and services.",
    category: "economy",
    allowedScope: "national",
  },
  {
    id: "ca.tax.tariffs",
    countryId: "CA",
    kind: "tax",
    targets: [],
    taxPolicy: {
      scope: "federal",
      taxType: "tariffs",
      minRate: 0,
      maxRate: 25,
      step: 0.5,
      baselineRate: 1,
      waypoints: [
        {
          rate: 0,
          label: "Free Trade",
        },
        {
          rate: 1,
          label: "Standard Schedule",
        },
        {
          rate: 5,
          label: "Moderate Protection",
        },
        {
          rate: 12,
          label: "High Protection",
        },
        {
          rate: 25,
          label: "Fortress Tariff",
        },
      ],
    },
    title: "Customs Tariff Act",
    description: "Duties on imported goods.",
    category: "economy",
    allowedScope: "national",
  },
  {
    id: "ca.economy.workerSecurity.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "economy.workerSecurity",
        weight: 1,
      },
    ],
    title: "Employment Standards and Worker Protection Act",
    description: "Minimum wages, notice, leave and the safety net under a job.",
    category: "economy",
    allowedScope: "both",
    baselineLevel: 3,
    levels: [
      {
        name: "Common Law Only",
        description: "Employment rests on contract alone; there is no statutory floor.",
      },
      {
        name: "Basic Standards",
        description: "A minimum wage and a few weeks of notice set the floor.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Employment Standards",
        description: "Statutory leave, overtime rules and termination pay apply to most jobs.",
        gdpCostFraction: 0.00076,
      },
      {
        name: "Strong Protections",
        description: "Higher wage floors, just-cause limits and enforced scheduling rules.",
        gdpCostFraction: 0.0014,
      },
      {
        name: "Comprehensive Guarantees",
        description: "Wide guarantees on pay, leave, security and sectoral bargaining.",
        gdpCostFraction: 0.0022,
      },
    ],
  },
  {
    id: "ca.economy.mobility.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "economy.mobility",
        weight: 1,
      },
    ],
    title: "Social Assistance and Regional Opportunity Act",
    description: "Income support and regional programs that help people move up.",
    category: "economy",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Assistance",
        description: "No national help for people out of work or low income.",
      },
      {
        name: "Basic Relief",
        description: "Last-resort payments for those with nothing else.",
        incomeCostFraction: 0.0043,
      },
      {
        name: "Support and Regional Aid",
        description: "Income support paired with aid to slower-growing regions.",
        incomeCostFraction: 0.0072,
      },
      {
        name: "Broad Opportunity Programme",
        description:
          "Retraining, relocation help and child benefits reach most low-income households.",
        incomeCostFraction: 0.0143,
      },
      {
        name: "Full Opportunity Guarantee",
        description: "A comprehensive anti-poverty system with a guaranteed income floor.",
        incomeCostFraction: 0.0215,
      },
    ],
  },
  {
    id: "ca.economy.householdIncome.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "economy.householdIncome",
        weight: 1,
      },
    ],
    title: "Cost of Living Support Act",
    description: "Credits and rebates that stand between a household and rising prices.",
    category: "economy",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Support",
        description: "Households face prices unaided.",
      },
      {
        name: "Targeted Rebates",
        description: "Credits for low-income households on essentials.",
        incomeCostFraction: 0.008,
      },
      {
        name: "Broad Rebates",
        description: "Regular rebates on groceries, fuel and rent for most families.",
        incomeCostFraction: 0.0143,
      },
      {
        name: "Expanded Cost Support",
        description: "Support widens to housing, transit and heating costs.",
        incomeCostFraction: 0.0244,
      },
      {
        name: "Universal Cost Shield",
        description: "Comprehensive price relief across the household budget.",
        incomeCostFraction: 0.0337,
      },
    ],
  },
  {
    id: "ca.economy.stability.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "economy.stability",
        weight: 1,
      },
    ],
    title: "Monetary and Financial Stability Act",
    description: "The central bank's mandate and the backstops behind the financial system.",
    category: "economy",
    allowedScope: "national",
    baselineLevel: 3,
    levels: [
      {
        name: "No Framework",
        description: "No statutory stabilization tools.",
      },
      {
        name: "Monitoring",
        description: "The central bank watches the system and publishes warnings.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Inflation Targeting",
        description: "A formal inflation target and standing liquidity facilities.",
        gdpCostFraction: 0.0006,
      },
      {
        name: "Active Stabilization",
        description: "Countercyclical buffers and deposit insurance backstops.",
        gdpCostFraction: 0.0011,
      },
      {
        name: "Full Toolkit",
        description: "Broad powers over credit, capital flows and prices.",
        gdpCostFraction: 0.0018,
      },
    ],
  },
  {
    id: "ca.economy.productivity.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "economy.productivity",
        weight: 1,
      },
    ],
    title: "Innovation and Productivity Act",
    description: "Tax credits, councils and campaigns against the productivity gap.",
    category: "economy",
    allowedScope: "both",
    baselineLevel: 2,
    levels: [
      {
        name: "No Programmes",
        description: "Investment goes unaided.",
      },
      {
        name: "Advisory Councils",
        description: "Industry councils advise and demonstrate best practice.",
        gdpCostFraction: 0.0006,
      },
      {
        name: "Investment Incentives",
        description: "Accelerated write-offs and credits pull capital into plants and equipment.",
        gdpCostFraction: 0.0013,
      },
      {
        name: "Industrial Modernization",
        description: "Funds for adoption of advanced technology across sectors.",
        gdpCostFraction: 0.0023,
      },
      {
        name: "National Investment Drive",
        description: "A national push to lift output per worker.",
        gdpCostFraction: 0.0035,
      },
    ],
  },
  {
    id: "ca.economy.fiscal.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "economy.fiscal",
        weight: 1,
      },
    ],
    title: "Fiscal Responsibility and Debt Act",
    description: "Budget rules, debt anchors and the discipline of the public accounts.",
    category: "economy",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Framework",
        description: "No fiscal rules; borrowing is unconstrained.",
      },
      {
        name: "Debt Reporting",
        description: "Debt is administered and reported but not limited.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Fiscal Anchors",
        description: "A declining debt-to-GDP target guides budgets.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Balanced Budget Rules",
        description: "Statutory deficit limits and spending reviews.",
        gdpCostFraction: 0.0005,
      },
      {
        name: "Strict Budget Law",
        description: "Hard caps on deficits and mandatory repayment schedules.",
        gdpCostFraction: 0.0007,
      },
    ],
  },
  {
    id: "ca.economy.competition.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "economy.competition",
        weight: 1,
      },
    ],
    title: "Competition and Markets Act",
    description: "Rules against cartels, abuse of dominance and anticompetitive mergers.",
    category: "economy",
    allowedScope: "national",
    baselineLevel: 1,
    levels: [
      {
        name: "No Enforcement",
        description: "Markets police themselves.",
      },
      {
        name: "Bureau Inquiries",
        description: "A bureau studies markets but cannot compel change.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Active Enforcement",
        description: "Penalties for cartels and abuse of dominance.",
        gdpCostFraction: 0.0004,
        gdpRevenueFraction: 0.0001,
      },
      {
        name: "Structural Enforcement",
        description: "Breakups and tight merger review where power concentrates.",
        gdpCostFraction: 0.0006,
        gdpRevenueFraction: 0.00015,
      },
      {
        name: "Open Markets Charter",
        description: "Strong action to keep every market contestable.",
        gdpCostFraction: 0.0009,
        gdpRevenueFraction: 0.0002,
      },
    ],
  },
  {
    id: "ca.education.universalSchooling.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "education.universalSchooling",
        weight: 1,
      },
    ],
    title: "Public Schooling Funding Act",
    description: "Federal support for provincial public schools.",
    category: "education",
    allowedScope: "both",
    baselineLevel: 3,
    levels: [
      {
        name: "No Federal Support",
        description: "Schools rely wholly on provincial and local budgets.",
      },
      {
        name: "Basic Transfers",
        description: "Modest transfers support core schooling.",
        incomeCostFraction: 0.0057,
      },
      {
        name: "Full Public Schooling",
        description: "Dedicated transfers support free schooling for all through grade twelve.",
        incomeCostFraction: 0.0115,
      },
      {
        name: "Expanded Schooling",
        description: "Funds extend to kindergarten, special needs and rural schools.",
        incomeCostFraction: 0.0165,
      },
      {
        name: "Comprehensive Guarantee",
        description: "Every child is guaranteed a fully funded school place with supports.",
        incomeCostFraction: 0.0237,
      },
    ],
  },
  {
    id: "ca.education.teacherCorps.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "education.teacherCorps",
        weight: 1,
      },
    ],
    title: "Teachers and School Capacity Act",
    description: "Training, hiring and buildings for the school system.",
    category: "education",
    allowedScope: "both",
    baselineLevel: 2,
    levels: [
      {
        name: "No Programmes",
        description: "Staffing and buildings are left to the provinces.",
      },
      {
        name: "Emergency Hiring",
        description: "Short-term funds fill the worst shortages.",
        incomeCostFraction: 0.0022,
      },
      {
        name: "Teachers and Buildings",
        description: "Steady funding for training and school construction.",
        incomeCostFraction: 0.005,
      },
      {
        name: "National Teaching Service",
        description: "A national program recruits teachers to every region.",
        incomeCostFraction: 0.0086,
      },
      {
        name: "Full Staffing Guarantee",
        description: "Every classroom is fully staffed and every school kept in good repair.",
        incomeCostFraction: 0.0129,
      },
    ],
  },
  {
    id: "ca.education.adultSkills.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "education.adultSkills",
        weight: 1,
      },
    ],
    title: "Skills Training and Apprenticeship Act",
    description: "Colleges, trades training and adult learning.",
    category: "education",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Provision",
        description: "No national training system.",
      },
      {
        name: "Evening Programs",
        description: "Small grants support continuing education.",
        incomeCostFraction: 0.0014,
      },
      {
        name: "Colleges and Trades",
        description: "Funded college and apprenticeship places in most regions.",
        incomeCostFraction: 0.0029,
      },
      {
        name: "National Training System",
        description: "Employer partnerships, wage support and credential recognition.",
        incomeCostFraction: 0.005,
      },
      {
        name: "Universal Skills Guarantee",
        description: "Every adult can retrain at public expense.",
        incomeCostFraction: 0.0079,
      },
    ],
  },
  {
    id: "ca.education.attainment.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "education.attainment",
        weight: 1,
      },
    ],
    title: "Literacy and Completion Act",
    description: "Programs that get students to finish school and read well.",
    category: "education",
    allowedScope: "national",
    baselineLevel: 1,
    levels: [
      {
        name: "No Programmes",
        description: "No national effort on completion.",
      },
      {
        name: "Literacy Campaigns",
        description: "Funded reading and numeracy campaigns.",
        gdpCostFraction: 0.0006,
      },
      {
        name: "Completion Programs",
        description: "Tutoring and dropout prevention in struggling schools.",
        gdpCostFraction: 0.0012,
      },
      {
        name: "Attainment Standards",
        description: "National completion targets backed by funding.",
        gdpCostFraction: 0.002,
      },
      {
        name: "Universal Attainment Drive",
        description: "A sustained national push for every student to finish and succeed.",
        gdpCostFraction: 0.0031,
      },
    ],
  },
  {
    id: "ca.education.research.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "education.research",
        weight: 1,
      },
    ],
    title: "Research Councils and Science Funding Act",
    description: "Federal grants for universities and science.",
    category: "education",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Councils",
        description: "No federal research funding.",
      },
      {
        name: "Research Grants",
        description: "Competitive grants for investigators.",
        gdpCostFraction: 0.0007,
      },
      {
        name: "Research Establishment",
        description: "Granting councils and national laboratories.",
        gdpCostFraction: 0.0014,
      },
      {
        name: "National Research Drive",
        description: "Large chairs, institutes and strategic programs.",
        gdpCostFraction: 0.0025,
      },
      {
        name: "Scientific Mobilization",
        description: "A whole-of-government commitment to leading science.",
        gdpCostFraction: 0.004,
      },
    ],
  },
  {
    id: "ca.education.standards.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "education.standards",
        weight: 1,
      },
    ],
    title: "Assessment and Curriculum Standards Act",
    description: "Testing, inspection and the content of school learning.",
    category: "education",
    allowedScope: "both",
    baselineLevel: 2,
    levels: [
      {
        name: "No National Standards",
        description: "Each province sets its own bar.",
      },
      {
        name: "Voluntary Benchmarks",
        description: "Shared benchmarks that provinces may adopt.",
        gdpCostFraction: 0.0003,
      },
      {
        name: "Common Assessments",
        description: "Regular standardized assessments reported publicly.",
        gdpCostFraction: 0.0006,
      },
      {
        name: "Certificate Regime",
        description: "Provincial certificates tied to common standards.",
        gdpCostFraction: 0.001,
      },
      {
        name: "Rigorous National Regime",
        description: "Demanding national standards with external inspection.",
        gdpCostFraction: 0.0015,
      },
    ],
  },
  {
    id: "ca.education.choice.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "education.choice",
        weight: 1,
      },
    ],
    title: "School Choice and Independent Schools Act",
    description: "Public support for families choosing outside the neighbourhood school.",
    category: "education",
    allowedScope: "both",
    baselineLevel: 1,
    levels: [
      {
        name: "Assigned Places Only",
        description: "Children attend their assigned public school.",
      },
      {
        name: "Limited Choice",
        description: "Some transfers and charter places are allowed.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Funded Independent Schools",
        description: "Partial public funding follows students to approved independent schools.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Broad Choice Support",
        description: "Vouchers and open enrolment widen options.",
        gdpCostFraction: 0.0008,
      },
      {
        name: "Full Choice System",
        description: "Funding follows every child to any approved school.",
        gdpCostFraction: 0.0013,
      },
    ],
  },
  {
    id: "ca.health.universalCare.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "health.universalCare",
        weight: 1,
      },
    ],
    title: "Canada Health Transfer Act",
    description: "Federal funding for publicly insured hospital and physician care.",
    category: "health",
    allowedScope: "national",
    baselineLevel: 4,
    levels: [
      {
        name: "No Federal Role",
        description: "Health care is left entirely to the provinces.",
      },
      {
        name: "Basic Hospital Insurance",
        description: "Federal funds cover hospital stays.",
        incomeCostFraction: 0.009,
      },
      {
        name: "Public Medical Insurance",
        description: "Hospital and physician services are insured on public terms.",
        incomeCostFraction: 0.0158,
      },
      {
        name: "Broad Public Service",
        description: "Coverage extends to drugs, dental and home care.",
        incomeCostFraction: 0.0237,
      },
      {
        name: "Universal Comprehensive Service",
        description: "Public coverage for nearly all health needs without user fees.",
        incomeCostFraction: 0.0308,
      },
    ],
  },
  {
    id: "ca.health.socialInsurance.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "health.socialInsurance",
        weight: 1,
      },
    ],
    title: "Pensions and Seniors Benefits Act",
    description: "Public pensions and income support for older Canadians.",
    category: "health",
    allowedScope: "national",
    baselineLevel: 3,
    budgetKeyOverride: "statePensions",
    levels: [
      {
        name: "No Public Pensions",
        description: "Retirement income is private.",
      },
      {
        name: "Basic Pension",
        description: "A flat pension for those in need.",
        incomeCostFraction: 0.0108,
      },
      {
        name: "Earnings-Related Pension",
        description: "A contributory plan adds to a basic pension.",
        incomeCostFraction: 0.0201,
      },
      {
        name: "Expanded Pension",
        description: "Higher replacement rates and a guaranteed income supplement.",
        incomeCostFraction: 0.0301,
      },
      {
        name: "Full Retirement Security",
        description: "Generous public pensions replace most earnings.",
        incomeCostFraction: 0.0416,
      },
    ],
  },
  {
    id: "ca.health.prevention.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "health.prevention",
        weight: 1,
      },
    ],
    title: "Public Health and Immunization Act",
    description: "Disease control, vaccination and health promotion.",
    category: "health",
    allowedScope: "both",
    baselineLevel: 2,
    levels: [
      {
        name: "No Programme",
        description: "No coordinated public health.",
      },
      {
        name: "Surveillance Only",
        description: "Basic disease reporting and outbreak response.",
        incomeCostFraction: 0.0011,
      },
      {
        name: "Vaccination Programs",
        description: "Funded immunization across all provinces.",
        incomeCostFraction: 0.0032,
      },
      {
        name: "Preventive Network",
        description: "Screening, tobacco control and mental health promotion.",
        incomeCostFraction: 0.0057,
      },
      {
        name: "Total Prevention System",
        description: "Prevention reaches every community with sustained funding.",
        incomeCostFraction: 0.0086,
      },
    ],
  },
  {
    id: "ca.health.outcomes.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "health.outcomes",
        weight: 1,
      },
    ],
    title: "Health Quality and Wait Times Act",
    description: "Investment in hospitals, wait times and measurable results.",
    category: "health",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Investment",
        description: "No targets for health outcomes.",
      },
      {
        name: "Reporting",
        description: "Wait times and outcomes are published.",
        gdpCostFraction: 0.001,
      },
      {
        name: "Targets and Funding",
        description: "Dedicated funds tied to wait time targets.",
        gdpCostFraction: 0.002,
      },
      {
        name: "National Health Campaign",
        description: "Campaigns against cancer, heart disease and surgical backlogs.",
        gdpCostFraction: 0.0035,
      },
      {
        name: "Outcomes Guarantee",
        description: "Guaranteed maximum wait times for core services.",
        gdpCostFraction: 0.0056,
      },
    ],
  },
  {
    id: "ca.health.responsibility.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "health.responsibility",
        weight: 1,
      },
    ],
    title: "User Charges and Benefit Conditions Act",
    description: "Whether users pay part of the cost and what conditions apply.",
    category: "health",
    allowedScope: "national",
    baselineLevel: 1,
    levels: [
      {
        name: "No Conditions",
        description: "Care and benefits carry no charges or conditions.",
      },
      {
        name: "Modest Charges",
        description: "Small co-payments on some services.",
        gdpCostFraction: 0.0003,
      },
      {
        name: "Targeting Regime",
        description: "Benefits are income-tested and targeted.",
        gdpCostFraction: 0.0006,
      },
      {
        name: "Work Requirements",
        description: "Benefits depend on work or training effort.",
        gdpCostFraction: 0.0009,
      },
      {
        name: "Strict Conditionality",
        description: "Benefits tightly conditioned and time limited.",
        gdpCostFraction: 0.0013,
      },
    ],
  },
  {
    id: "ca.health.providerChoice.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "health.providerChoice",
        weight: 1,
      },
    ],
    title: "Private Care and Insurance Act",
    description: "The room for private clinics and insurance beside the public system.",
    category: "health",
    allowedScope: "national",
    baselineLevel: 1,
    levels: [
      {
        name: "No Framework",
        description: "Private health activity is prohibited.",
      },
      {
        name: "Limited Private Role",
        description: "Some private clinics under public rules.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Mixed Delivery",
        description: "Private clinics and insurance for supplementary care.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Choice Protections",
        description: "Patients may buy private care for insured services.",
        gdpCostFraction: 0.0006,
      },
      {
        name: "Open Market Charter",
        description: "A fully open market in health care and insurance.",
        gdpCostFraction: 0.0009,
      },
    ],
  },
  {
    id: "ca.health.systemEfficiency.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "health.systemEfficiency",
        weight: 1,
      },
    ],
    title: "Health System Efficiency and Management Act",
    description: "Management, cost control and productivity in health delivery.",
    category: "health",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Programme",
        description: "No efficiency effort.",
      },
      {
        name: "Cost Reporting",
        description: "Hospitals report unit costs.",
        gdpCostFraction: 0.00025,
      },
      {
        name: "Efficiency Committee",
        description: "A standing body reviews spending and waste.",
        gdpCostFraction: 0.0005,
      },
      {
        name: "Performance Funding",
        description: "Funding tied to measured performance.",
        gdpCostFraction: 0.0008,
      },
      {
        name: "Lean System Mandate",
        description: "Delivery is redesigned for lean, integrated care.",
        gdpCostFraction: 0.0012,
      },
    ],
  },
  {
    id: "ca.infrastructure.publicHousing.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "infrastructure.publicHousing",
        weight: 1,
      },
    ],
    title: "National Housing Strategy Act",
    description: "Social and affordable housing programs.",
    category: "infrastructure",
    allowedScope: "both",
    baselineLevel: 3,
    budgetKeyOverride: "other",
    levels: [
      {
        name: "No Public Housing",
        description: "No federal housing role.",
      },
      {
        name: "Targeted Supports",
        description: "Rent supplements and a small stock for the homeless.",
        incomeCostFraction: 0.0086,
      },
      {
        name: "Social Housing Programme",
        description: "Steady funding builds and maintains social housing.",
        incomeCostFraction: 0.0158,
      },
      {
        name: "Large-Scale Building",
        description: "Hundreds of thousands of new affordable homes.",
        incomeCostFraction: 0.0251,
      },
      {
        name: "Universal Housing Duty",
        description: "A legal duty that every household has a decent home.",
        incomeCostFraction: 0.0359,
      },
    ],
  },
  {
    id: "ca.infrastructure.transit.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "infrastructure.transit",
        weight: 1,
      },
    ],
    title: "Public Transit Investment Act",
    description: "Federal money for urban transit and passenger rail.",
    category: "infrastructure",
    allowedScope: "both",
    baselineLevel: 2,
    levels: [
      {
        name: "No Support",
        description: "Transit is left to cities and provinces.",
      },
      {
        name: "Operating Grants",
        description: "Grants help cover operating deficits.",
        gdpCostFraction: 0.0015,
      },
      {
        name: "Modernization Support",
        description: "Capital for fleets, stations and signalling.",
        gdpCostFraction: 0.003,
      },
      {
        name: "Network Investment",
        description: "New subways, light rail and intercity service.",
        gdpCostFraction: 0.0055,
      },
      {
        name: "Total Network Renewal",
        description: "A complete renewal of transit and rail across the country.",
        gdpCostFraction: 0.0085,
      },
    ],
  },
  {
    id: "ca.infrastructure.utilities.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "infrastructure.utilities",
        weight: 1,
      },
    ],
    title: "Rural Broadband and Utilities Act",
    description: "Connecting every community to power, water and the internet.",
    category: "infrastructure",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Programme",
        description: "Utility build-out is left to the market.",
      },
      {
        name: "Rural Grants",
        description: "Grants help connect remote communities.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Connection Programme",
        description: "A funded program for broadband and water systems.",
        gdpCostFraction: 0.00076,
      },
      {
        name: "Universal Service Drive",
        description: "A national target to connect every home.",
        gdpCostFraction: 0.0014,
      },
      {
        name: "Total Connection Mandate",
        description:
          "Every community, including remote and northern ones, is served at full quality.",
        gdpCostFraction: 0.0021,
      },
    ],
  },
  {
    id: "ca.infrastructure.condition.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "infrastructure.condition",
        weight: 1,
      },
    ],
    title: "Public Works and Asset Renewal Act",
    description: "Keeping bridges, roads and public buildings in good repair.",
    category: "infrastructure",
    allowedScope: "both",
    baselineLevel: 2,
    levels: [
      {
        name: "Deferred Maintenance",
        description: "Repairs wait until things fail.",
      },
      {
        name: "Emergency Repairs",
        description: "Funds address the worst failures.",
        gdpCostFraction: 0.0011,
      },
      {
        name: "Maintenance Programme",
        description: "Regular maintenance on public assets.",
        gdpCostFraction: 0.0023,
      },
      {
        name: "Resilience Standard",
        description: "Assets are renewed to climate-resilient standards.",
        gdpCostFraction: 0.0039,
      },
      {
        name: "Gold Standard Upkeep",
        description: "All public assets are kept in top condition.",
        gdpCostFraction: 0.006,
      },
    ],
  },
  {
    id: "ca.infrastructure.highways.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "infrastructure.highways",
        weight: 1,
      },
    ],
    title: "National Highways Programme Act",
    description: "The national highway system and trade corridors.",
    category: "infrastructure",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Roads Programme",
        description: "Highways are left to the provinces.",
      },
      {
        name: "Highway Maintenance",
        description: "Basic upkeep of national routes.",
        gdpCostFraction: 0.0011,
      },
      {
        name: "Highway Improvement",
        description: "Twinning and upgrades on major corridors.",
        gdpCostFraction: 0.0023,
      },
      {
        name: "Expressway Programme",
        description: "New expressways and bridges.",
        gdpCostFraction: 0.0042,
      },
      {
        name: "National Highway Grid",
        description: "A complete modern grid across the country.",
        gdpCostFraction: 0.0068,
      },
    ],
  },
  {
    id: "ca.infrastructure.ownership.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "infrastructure.ownership",
        weight: 1,
      },
    ],
    title: "Home Ownership and Mortgage Act",
    description: "Help for families buying a home.",
    category: "infrastructure",
    allowedScope: "national",
    baselineLevel: 2,
    budgetKeyOverride: "other",
    levels: [
      {
        name: "No Support",
        description: "Ownership is left to the market.",
      },
      {
        name: "Mortgage Insurance",
        description: "Public mortgage insurance lowers down payments.",
        gdpCostFraction: 0.0006,
      },
      {
        name: "Guarantee Scheme",
        description: "Guarantees and tax-free savings accounts support buyers.",
        gdpCostFraction: 0.0012,
      },
      {
        name: "Ownership Drive",
        description: "Down payment grants and first-time buyer rebates.",
        gdpCostFraction: 0.0021,
      },
      {
        name: "Property Owning Democracy",
        description: "The public policy aim is a home for every family.",
        gdpCostFraction: 0.0033,
      },
    ],
  },
  {
    id: "ca.infrastructure.development.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "infrastructure.development",
        weight: 1,
      },
    ],
    title: "Land Use and Development Approvals Act",
    description: "Permitting, zoning and the speed of building.",
    category: "infrastructure",
    allowedScope: "both",
    baselineLevel: 1,
    levels: [
      {
        name: "No Planning Control",
        description: "Land use is wholly unregulated.",
      },
      {
        name: "Planning Permissions",
        description: "Municipal permits are required for most building.",
        gdpCostFraction: 0.0002,
        gdpRevenueFraction: 0.0001,
      },
      {
        name: "Streamlined Consent",
        description: "Approvals are faster and more predictable.",
        gdpCostFraction: 0.0003,
        gdpRevenueFraction: 0.00015,
      },
      {
        name: "Development Districts",
        description: "Priority zones with pre-approved building.",
        gdpCostFraction: 0.0005,
        gdpRevenueFraction: 0.0002,
      },
      {
        name: "Open Building Charter",
        description: "Building is allowed as of right in most places.",
        gdpCostFraction: 0.0007,
        gdpRevenueFraction: 0.00025,
      },
    ],
  },
  {
    id: "ca.order.dueProcess.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "order.dueProcess",
        weight: 1,
      },
    ],
    title: "Criminal Procedure and Charter Rights Act",
    description: "Rights of the accused, from arrest to trial.",
    category: "order",
    allowedScope: "both",
    baselineLevel: 2,
    levels: [
      {
        name: "No Statutory Standards",
        description: "Procedure rests on discretion.",
      },
      {
        name: "Basic Protections",
        description: "Core rights on arrest and detention.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Detention Standards",
        description: "Limits on pre-trial detention and conditions of custody.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Strong Process Rights",
        description: "Disclosure, counsel and trial-delay protections.",
        gdpCostFraction: 0.0007,
      },
      {
        name: "Full Rights Charter",
        description: "Complete protection of every procedural right.",
        gdpCostFraction: 0.001,
      },
    ],
  },
  {
    id: "ca.order.legalAid.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "order.legalAid",
        weight: 1,
      },
    ],
    title: "Legal Aid and Access to Justice Act",
    description: "Counsel and advice for people who cannot afford a lawyer.",
    category: "order",
    allowedScope: "both",
    baselineLevel: 2,
    levels: [
      {
        name: "No Legal Aid",
        description: "People face courts alone.",
      },
      {
        name: "Duty Counsel",
        description: "Duty counsel is available in some courts.",
        incomeCostFraction: 0.0006,
      },
      {
        name: "Legal Aid Scheme",
        description: "A funded plan covers criminal and family matters.",
        incomeCostFraction: 0.0013,
      },
      {
        name: "Access Guarantee",
        description: "Legal aid extends to poverty law and immigration.",
        incomeCostFraction: 0.0023,
      },
      {
        name: "Universal Legal Service",
        description: "Legal advice is available to everyone who needs it.",
        incomeCostFraction: 0.0036,
      },
    ],
  },
  {
    id: "ca.order.communityTrust.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "order.communityTrust",
        weight: 1,
      },
    ],
    title: "Police Oversight and Accountability Act",
    description: "Civilian oversight and community trust in policing.",
    category: "order",
    allowedScope: "both",
    baselineLevel: 2,
    levels: [
      {
        name: "No Oversight",
        description: "Police investigate themselves.",
      },
      {
        name: "Complaint Bodies",
        description: "Civilian bodies receive complaints.",
        gdpCostFraction: 0.00015,
      },
      {
        name: "Conduct Standards",
        description: "Binding conduct and use-of-force standards.",
        gdpCostFraction: 0.0003,
      },
      {
        name: "Accountability Regime",
        description: "Independent investigation of serious incidents.",
        gdpCostFraction: 0.0005,
      },
      {
        name: "Full Consent Model",
        description: "Police work under strong community direction and review.",
        gdpCostFraction: 0.0008,
      },
    ],
  },
  {
    id: "ca.order.safety.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "order.safety",
        weight: 1,
      },
    ],
    title: "Crime Prevention and Community Safety Act",
    description: "Grants for prevention, youth and victim services.",
    category: "order",
    allowedScope: "both",
    baselineLevel: 2,
    levels: [
      {
        name: "No Programmes",
        description: "No federal prevention effort.",
      },
      {
        name: "Targeted Grants",
        description: "Grants for high-risk neighbourhoods.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Prevention Programme",
        description: "Funded prevention across communities.",
        gdpCostFraction: 0.00076,
      },
      {
        name: "National Safety Drive",
        description: "A national safety strategy with sustained funding.",
        gdpCostFraction: 0.0013,
      },
      {
        name: "Total Safety Guarantee",
        description: "Every community has full prevention and victim services.",
        gdpCostFraction: 0.002,
      },
    ],
  },
  {
    id: "ca.order.courts.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "order.courts",
        weight: 1,
      },
    ],
    title: "Courts Capacity and Judicial Appointments Act",
    description: "Judges, courtrooms and the speed of justice.",
    category: "order",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "Starved Courts",
        description: "Vacancies and delays plague the courts.",
      },
      {
        name: "Judicial Appointments",
        description: "Vacancies are filled promptly.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Court Modernization",
        description: "Digital filing and more courtrooms.",
        gdpCostFraction: 0.0009,
      },
      {
        name: "Speedy Trial Standard",
        description: "Firm time limits for trials.",
        gdpCostFraction: 0.0015,
      },
      {
        name: "Full Capacity Guarantee",
        description: "Every case is heard promptly and in full.",
        gdpCostFraction: 0.0022,
      },
    ],
  },
  {
    id: "ca.order.policeStrength.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "order.policeStrength",
        weight: 1,
      },
    ],
    title: "Policing Services and Funding Act",
    description: "The size and resourcing of police services.",
    category: "order",
    allowedScope: "both",
    baselineLevel: 2,
    levels: [
      {
        name: "Skeleton Forces",
        description: "Understaffed police.",
      },
      {
        name: "Establishment Funding",
        description: "Funding sustains current strength.",
        gdpCostFraction: 0.0009,
      },
      {
        name: "Modern Constabulary",
        description: "Modern equipment and training across services.",
        gdpCostFraction: 0.0018,
      },
      {
        name: "National Enforcement Web",
        description: "Federal and provincial police coordinate nationwide.",
        gdpCostFraction: 0.003,
      },
      {
        name: "Maximum Enforcement",
        description: "The largest feasible police presence.",
        gdpCostFraction: 0.0045,
      },
    ],
  },
  {
    id: "ca.order.deterrence.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "order.deterrence",
        weight: 1,
      },
    ],
    title: "Sentencing and Corrections Act",
    description: "Sentences, parole and the prison system.",
    category: "order",
    allowedScope: "both",
    baselineLevel: 2,
    levels: [
      {
        name: "No Policy",
        description: "No sentencing guidance.",
      },
      {
        name: "Prison Standards",
        description: "Standards for custody and release.",
        gdpCostFraction: 0.0006,
      },
      {
        name: "Firm Sentencing",
        description: "Longer minimum sentences for serious crime.",
        gdpCostFraction: 0.0013,
      },
      {
        name: "Severe Regime",
        description: "Mandatory minimums and tight parole.",
        gdpCostFraction: 0.0021,
      },
      {
        name: "Maximum Deterrence",
        description: "The harshest sentencing and custody regime.",
        gdpCostFraction: 0.0032,
      },
    ],
  },
  {
    id: "ca.environment.conservation.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "environment.conservation",
        weight: 1,
      },
    ],
    title: "Water and Pollution Control Act",
    description: "Rules for lakes, rivers and industrial discharge.",
    category: "environment",
    allowedScope: "both",
    baselineLevel: 1,
    levels: [
      {
        name: "No Controls",
        description: "Discharges are unregulated.",
      },
      {
        name: "Watershed Boards",
        description: "Boards monitor major basins.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Discharge Permits",
        description: "Permits for industrial and municipal discharge.",
        gdpCostFraction: 0.0009,
      },
      {
        name: "Strict Limits",
        description: "Tight limits enforced with penalties.",
        gdpCostFraction: 0.0015,
      },
      {
        name: "Total Stewardship",
        description: "Every waterway is protected to the highest standard.",
        gdpCostFraction: 0.0023,
      },
    ],
  },
  {
    id: "ca.environment.stewardship.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "environment.stewardship",
        weight: 1,
      },
    ],
    title: "National Parks and Protected Areas Act",
    description: "Parks, wilderness and public access to nature.",
    category: "environment",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "Lands Unmanaged",
        description: "Public lands are left unmanaged.",
      },
      {
        name: "Parks Agency",
        description: "A parks agency maintains a few key parks.",
        gdpCostFraction: 0.0006,
      },
      {
        name: "Parks and Access Programme",
        description: "A funded network of parks and trails.",
        gdpCostFraction: 0.0013,
      },
      {
        name: "Landscape Stewardship",
        description: "Large protected areas and conservation partnerships.",
        gdpCostFraction: 0.0022,
      },
      {
        name: "National Stewardship",
        description: "A comprehensive plan to protect lands, waters and wildlife.",
        gdpCostFraction: 0.0034,
      },
    ],
  },
  {
    id: "ca.environment.urbanAir.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "environment.urbanAir",
        weight: 1,
      },
    ],
    title: "Clean Air and Emissions Standards Act",
    description: "Limits on smog, fumes and urban air pollution.",
    category: "environment",
    allowedScope: "both",
    baselineLevel: 1,
    levels: [
      {
        name: "No Programme",
        description: "Air quality is unregulated.",
      },
      {
        name: "Monitoring",
        description: "Air quality is measured and reported.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Emission Standards",
        description: "Vehicle and industrial emission standards.",
        gdpCostFraction: 0.0009,
      },
      {
        name: "Clean Air Standard",
        description: "Strict air standards enforced in every city.",
        gdpCostFraction: 0.0016,
      },
      {
        name: "Healthy Cities Charter",
        description: "The cleanest air achievable in every urban area.",
        gdpCostFraction: 0.0024,
      },
    ],
  },
  {
    id: "ca.environment.energySecurity.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "environment.energySecurity",
        weight: 1,
      },
    ],
    title: "Electricity and Grid Development Act",
    description: "Generation and grid investment for reliable power.",
    category: "environment",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Programme",
        description: "Energy supply is left to the market.",
      },
      {
        name: "Strategic Reserves",
        description: "Reserves and emergency plans.",
        gdpCostFraction: 0.0007,
      },
      {
        name: "Generation Programme",
        description: "Public investment in new generation.",
        gdpCostFraction: 0.0015,
      },
      {
        name: "Grid Modernization",
        description: "A modernized, interconnected grid across provinces.",
        gdpCostFraction: 0.0027,
      },
      {
        name: "Energy Independence Drive",
        description: "A national drive for secure, domestic energy.",
        gdpCostFraction: 0.0041,
      },
    ],
  },
  {
    id: "ca.environment.resourceDev.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "environment.resourceDev",
        weight: 1,
      },
    ],
    title: "Natural Resource Development Act",
    description: "Oil, gas, mining and forestry development.",
    category: "environment",
    allowedScope: "national",
    baselineLevel: 3,
    levels: [
      {
        name: "No Programme",
        description: "No federal role in resource development.",
      },
      {
        name: "Survey and Support",
        description: "Geological surveys and small grants.",
        gdpCostFraction: 0.0005,
        gdpRevenueFraction: 0.0001,
      },
      {
        name: "Development Programme",
        description: "Incentives for responsible resource projects.",
        gdpCostFraction: 0.001,
        gdpRevenueFraction: 0.0003,
      },
      {
        name: "Production Drive",
        description: "Faster approvals and infrastructure for major projects.",
        gdpCostFraction: 0.0018,
        gdpRevenueFraction: 0.00045,
      },
      {
        name: "Maximum Production Push",
        description: "Priority for maximum domestic production.",
        gdpCostFraction: 0.0027,
        gdpRevenueFraction: 0.0006,
      },
    ],
  },
  {
    id: "ca.environment.affordability.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "environment.affordability",
        weight: 1,
      },
    ],
    title: "Energy Affordability Act",
    description: "Keeping home heating and power bills manageable.",
    category: "environment",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Programme",
        description: "Energy prices float freely.",
      },
      {
        name: "Price Monitoring",
        description: "Prices are watched and reported.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Rate Restraint",
        description: "Regulators restrain rate increases.",
        gdpCostFraction: 0.0006,
      },
      {
        name: "Household Energy Support",
        description: "Rebates for heating and electricity bills.",
        gdpCostFraction: 0.0011,
      },
      {
        name: "Guaranteed Affordability",
        description: "Energy for essential needs is guaranteed at low cost.",
        gdpCostFraction: 0.0017,
      },
    ],
  },
  {
    id: "ca.environment.extraction.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "environment.extraction",
        weight: 1,
      },
    ],
    title: "Mineral Rights and Access Act",
    description: "Who may explore and mine, and where.",
    category: "environment",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "Grounds Closed",
        description: "Public lands are closed to mining.",
      },
      {
        name: "Licensing Windows",
        description: "Limited licensing periods for claims.",
        gdpCostFraction: 0.0001,
        gdpRevenueFraction: 0.0002,
      },
      {
        name: "Streamlined Licensing",
        description: "Faster, clearer licensing.",
        gdpCostFraction: 0.00015,
        gdpRevenueFraction: 0.0003,
      },
      {
        name: "Open Access Regime",
        description: "Most lands open to exploration.",
        gdpCostFraction: 0.0002,
        gdpRevenueFraction: 0.0004,
      },
      {
        name: "Maximum Access Charter",
        description: "Exploration is allowed almost everywhere.",
        gdpCostFraction: 0.00025,
        gdpRevenueFraction: 0.0005,
      },
    ],
  },
  {
    id: "ca.society.integration.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "society.integration",
        weight: 1,
      },
    ],
    title: "Equality and Human Rights Act",
    description: "Protection from discrimination and support for integration.",
    category: "society",
    allowedScope: "national",
    baselineLevel: 3,
    levels: [
      {
        name: "No Statutory Protection",
        description: "No law against discrimination.",
      },
      {
        name: "Public Services Rule",
        description: "Equal treatment in public services.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Human Rights Commission",
        description: "A commission hears complaints and promotes equality.",
        gdpCostFraction: 0.0009,
      },
      {
        name: "Broad Enforcement",
        description: "Wide enforcement in work, housing and services.",
        gdpCostFraction: 0.0015,
      },
      {
        name: "Full Equality Charter",
        description: "Comprehensive duties to promote equality for all.",
        gdpCostFraction: 0.0023,
      },
    ],
  },
  {
    id: "ca.society.womensOpportunity.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "society.womensOpportunity",
        weight: 1,
      },
    ],
    title: "Women's Opportunity and Child Care Act",
    description: "Child care, pay equity and women's economic participation.",
    category: "society",
    allowedScope: "national",
    baselineLevel: 3,
    budgetKeyOverride: "welfare",
    levels: [
      {
        name: "No Programmes",
        description: "No dedicated programs.",
      },
      {
        name: "Women's Services",
        description: "Shelters and employment services for women.",
        incomeCostFraction: 0.0006,
      },
      {
        name: "Pay Equity Rules",
        description: "Pay equity law applies in the public sector.",
        incomeCostFraction: 0.0013,
      },
      {
        name: "Child Care Network",
        description: "A national child care plan at low fees.",
        incomeCostFraction: 0.0024,
      },
      {
        name: "Full Opportunity System",
        description: "A full system of child care, pay equity and leave.",
        incomeCostFraction: 0.0037,
      },
    ],
  },
  {
    id: "ca.society.socialMobility.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "society.socialMobility",
        weight: 1,
      },
    ],
    title: "Opportunity and Advancement Act",
    description: "Scholarships, supports and ladders for those starting behind.",
    category: "society",
    allowedScope: "national",
    baselineLevel: 1,
    budgetKeyOverride: "welfare",
    levels: [
      {
        name: "No Programmes",
        description: "No dedicated mobility programs.",
      },
      {
        name: "Scholarship Ladders",
        description: "Targeted bursaries and scholarships.",
        incomeCostFraction: 0.0007,
      },
      {
        name: "Advancement Programmes",
        description: "Mentoring and bridging programs.",
        incomeCostFraction: 0.0016,
      },
      {
        name: "Mobility Guarantee",
        description: "A guarantee of support through each stage of schooling and work.",
        incomeCostFraction: 0.0027,
      },
      {
        name: "Open Society Drive",
        description: "A national push so that circumstances of birth matter little.",
        incomeCostFraction: 0.0042,
      },
    ],
  },
  {
    id: "ca.society.demography.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "society.demography",
        weight: 1,
      },
    ],
    title: "Population, Census and Family Policy Act",
    description: "Census taking, registration and policies that shape family size.",
    category: "society",
    allowedScope: "national",
    baselineLevel: 1,
    budgetKeyOverride: "welfare",
    levels: [
      {
        name: "Count Only",
        description: "A census and nothing more.",
      },
      {
        name: "Registration Service",
        description: "Civil registration and vital statistics.",
        gdpCostFraction: 0.0003,
      },
      {
        name: "Family Programmes",
        description: "Parental leave and family supports.",
        gdpCostFraction: 0.0007,
      },
      {
        name: "Population Policy",
        description: "A coordinated policy on fertility, aging and immigration.",
        gdpCostFraction: 0.0012,
      },
      {
        name: "Full Demographic Policy",
        description: "A comprehensive plan to shape the population's future.",
        gdpCostFraction: 0.0018,
      },
    ],
  },
  {
    id: "ca.society.civicLife.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "society.civicLife",
        weight: 1,
      },
    ],
    title: "Charities and Civic Participation Act",
    description: "Volunteer groups, charities and community life.",
    category: "society",
    allowedScope: "both",
    baselineLevel: 1,
    budgetKeyOverride: "welfare",
    levels: [
      {
        name: "No Support",
        description: "Civic groups are on their own.",
      },
      {
        name: "Charitable Framework",
        description: "A charities registry and tax receipts.",
        gdpCostFraction: 0.00025,
      },
      {
        name: "Community Facilities",
        description: "Funding for community halls, arts and sport.",
        gdpCostFraction: 0.0005,
      },
      {
        name: "Civic Service",
        description: "Youth service corps and civic education.",
        gdpCostFraction: 0.0009,
      },
      {
        name: "Civic Renaissance Drive",
        description: "A sustained national drive to renew civic life.",
        gdpCostFraction: 0.0014,
      },
    ],
  },
  {
    id: "ca.society.familyStability.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "society.familyStability",
        weight: 1,
      },
    ],
    title: "Child and Family Benefits Act",
    description: "Payments to families with children.",
    category: "society",
    allowedScope: "national",
    baselineLevel: 2,
    budgetKeyOverride: "welfare",
    levels: [
      {
        name: "No Benefits",
        description: "No federal child benefits.",
      },
      {
        name: "Low-Income Benefit",
        description: "Payments to low-income families.",
        incomeCostFraction: 0.0043,
      },
      {
        name: "Child Benefit",
        description: "A monthly benefit for most families.",
        incomeCostFraction: 0.0086,
      },
      {
        name: "Family Support System",
        description: "Benefits, leave and tax credits work together.",
        incomeCostFraction: 0.0143,
      },
      {
        name: "Full Family Charter",
        description: "Comprehensive support for every family.",
        incomeCostFraction: 0.0215,
      },
    ],
  },
  {
    id: "ca.society.tradition.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "society.tradition",
        weight: 1,
      },
    ],
    title: "National Heritage and Identity Act",
    description: "Official ceremony, heritage and national identity.",
    category: "society",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Programmes",
        description: "No national heritage programs.",
      },
      {
        name: "National Observances",
        description: "Official holidays and ceremonies.",
        gdpCostFraction: 0.00015,
      },
      {
        name: "Heritage Programmes",
        description: "Funding for museums, archives and historic sites.",
        gdpCostFraction: 0.0003,
      },
      {
        name: "National Tradition Drive",
        description: "Active promotion of national symbols and history.",
        gdpCostFraction: 0.0005,
      },
      {
        name: "National Identity Charter",
        description: "A comprehensive program on shared identity and tradition.",
        gdpCostFraction: 0.0007,
      },
    ],
  },
  {
    id: "ca.governance.participation.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "governance.participation",
        weight: 1,
      },
    ],
    title: "Elections and Franchise Act",
    description: "Who votes and how easily.",
    category: "governance",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "Restricted Franchise",
        description: "Voting is restricted.",
      },
      {
        name: "Universal Franchise",
        description: "All adult citizens may vote.",
        gdpCostFraction: 0.0001,
      },
      {
        name: "Modern Registration",
        description: "Automatic voter registration and accessible polling.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Access Enforcement",
        description: "Active enforcement of ballot access.",
        gdpCostFraction: 0.0003,
      },
      {
        name: "Full Participation Charter",
        description: "Barriers to voting are removed and turnout is promoted.",
        gdpCostFraction: 0.00045,
      },
    ],
  },
  {
    id: "ca.governance.openness.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "governance.openness",
        weight: 1,
      },
    ],
    title: "Access to Information Act",
    description: "Public access to government records and decisions.",
    category: "governance",
    allowedScope: "national",
    baselineLevel: 1,
    levels: [
      {
        name: "Official Secrecy",
        description: "Records are closed by default.",
      },
      {
        name: "Publication Rules",
        description: "Key documents are published.",
        gdpCostFraction: 0.0001,
      },
      {
        name: "Records Access",
        description: "Citizens may request records with limited exemptions.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Open Government Standard",
        description: "Proactive disclosure and open data.",
        gdpCostFraction: 0.0003,
      },
      {
        name: "Radical Transparency",
        description: "Almost all records are public.",
        gdpCostFraction: 0.00045,
      },
    ],
  },
  {
    id: "ca.governance.localAutonomy.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "governance.localAutonomy",
        weight: 1,
      },
    ],
    title: "Federal-Provincial Fiscal Arrangements Act",
    description: "Transfers and the autonomy of provinces and cities.",
    category: "governance",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Transfers",
        description: "The centre funds nothing at other levels.",
      },
      {
        name: "Specific Grants",
        description: "Conditional grants for named purposes.",
        gdpCostFraction: 0.0009,
      },
      {
        name: "Equalization Settlement",
        description: "Equalization and transfers even out provincial capacity.",
        gdpCostFraction: 0.0018,
      },
      {
        name: "Block Transfers",
        description: "Flexible block grants with light conditions.",
        gdpCostFraction: 0.003,
      },
      {
        name: "Devolved Finance",
        description: "Provinces and cities control most of their revenue.",
        gdpCostFraction: 0.0045,
      },
    ],
  },
  {
    id: "ca.governance.integrity.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "governance.integrity",
        weight: 1,
      },
    ],
    title: "Accountability and Ethics Act",
    description: "Auditors, ethics commissioners and anticorruption rules.",
    category: "governance",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Watchdogs",
        description: "Nobody checks the government.",
      },
      {
        name: "Auditor General",
        description: "An independent auditor reviews public accounts.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Ethics Commissioner",
        description: "Conflict of interest rules and a commissioner.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Anticorruption Regime",
        description: "Lobbying limits, integrity officers and prosecution.",
        gdpCostFraction: 0.0007,
      },
      {
        name: "Glass House Standard",
        description: "Public life is held to the strictest standard.",
        gdpCostFraction: 0.001,
      },
    ],
  },
  {
    id: "ca.governance.administration.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "governance.administration",
        weight: 1,
      },
    ],
    title: "Public Service Modernization Act",
    description: "The professional public service and how it works.",
    category: "governance",
    allowedScope: "national",
    baselineLevel: 3,
    levels: [
      {
        name: "Patronage Service",
        description: "Jobs go to the loyal.",
      },
      {
        name: "Merit Foundations",
        description: "Hiring is on merit.",
        gdpCostFraction: 0.001,
      },
      {
        name: "Professional Service",
        description: "A trained, non-partisan service.",
        gdpCostFraction: 0.002,
      },
      {
        name: "Administrative Excellence",
        description: "Digital government and strong management.",
        gdpCostFraction: 0.0028,
      },
      {
        name: "Reformed Public Service",
        description: "A fully modernized, high-performing service.",
        gdpCostFraction: 0.004,
      },
    ],
  },
  {
    id: "ca.governance.decisiveness.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "governance.decisiveness",
        weight: 1,
      },
    ],
    title: "Cabinet and Government Organization Act",
    description: "How quickly and coherently the executive can act.",
    category: "governance",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "Fragmented Government",
        description: "Ministers work at cross purposes.",
      },
      {
        name: "Cabinet Offices",
        description: "Central offices support cabinet.",
        gdpCostFraction: 0.0001,
      },
      {
        name: "Organized Centre",
        description: "A coordinated centre sets priorities.",
        gdpCostFraction: 0.0003,
      },
      {
        name: "Streamlined Command",
        description: "A tight centre drives implementation.",
        gdpCostFraction: 0.0005,
      },
      {
        name: "Decisive Executive",
        description: "A powerful executive acts quickly.",
        gdpCostFraction: 0.0007,
      },
    ],
  },
  {
    id: "ca.governance.centralAuthority.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "governance.centralAuthority",
        weight: 1,
      },
    ],
    title: "Federal Powers and Authority Act",
    description: "The reach of Ottawa over the rest of the country.",
    category: "governance",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "Weak Centre",
        description: "The centre has little reach.",
      },
      {
        name: "Enforcement Capacity",
        description: "Federal agencies can enforce national law.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Assured Authority",
        description: "Clear federal authority in its fields.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Strong Centre",
        description: "The federal government leads in national matters.",
        gdpCostFraction: 0.0006,
      },
      {
        name: "Commanding Centre",
        description: "The federal government dominates policy.",
        gdpCostFraction: 0.0009,
      },
    ],
  },
  {
    id: "ca.defense.diplomacy.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "defense.diplomacy",
        weight: 1,
      },
    ],
    title: "Foreign Service and Diplomacy Act",
    description: "Embassies, missions and negotiation.",
    category: "defense",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "Skeleton Service",
        description: "A thin foreign service.",
      },
      {
        name: "Professional Service",
        description: "A career diplomatic corps.",
        gdpCostFraction: 0.003,
      },
      {
        name: "Global Diplomacy",
        description: "Missions across the world.",
        gdpCostFraction: 0.006,
      },
      {
        name: "Diplomatic Offensive",
        description: "Active, well-resourced diplomacy on many fronts.",
        gdpCostFraction: 0.0095,
      },
      {
        name: "Great Power Diplomacy",
        description: "Diplomacy on the scale of a major power.",
        gdpCostFraction: 0.0141,
      },
    ],
  },
  {
    id: "ca.defense.institutions.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "defense.institutions",
        weight: 1,
      },
    ],
    title: "International Organizations Act",
    description: "Membership and leadership in global bodies.",
    category: "defense",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Memberships",
        description: "The country stays out of international bodies.",
      },
      {
        name: "Member in Standing",
        description: "Membership and dues in major bodies.",
        gdpCostFraction: 0.002,
      },
      {
        name: "Commonwealth and G7 Leadership",
        description: "A prominent role in the Commonwealth and G7.",
        gdpCostFraction: 0.004,
      },
      {
        name: "System Architect",
        description: "The country helps design the international system.",
        gdpCostFraction: 0.0065,
      },
      {
        name: "Order Underwriter",
        description: "The country underwrites the international order.",
        gdpCostFraction: 0.0096,
      },
    ],
  },
  {
    id: "ca.defense.softPower.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "defense.softPower",
        weight: 1,
      },
    ],
    title: "International Broadcasting and Culture Act",
    description: "Cultural diplomacy and voice abroad.",
    category: "defense",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Voice Abroad",
        description: "No cultural diplomacy.",
      },
      {
        name: "External Services",
        description: "A small external broadcasting service.",
        gdpCostFraction: 0.0015,
      },
      {
        name: "Broadcasting and Council",
        description: "Broadcasting plus a cultural council.",
        gdpCostFraction: 0.003,
      },
      {
        name: "Cultural Offensive",
        description: "Large programs of exchange and promotion.",
        gdpCostFraction: 0.0048,
      },
      {
        name: "Global Persuasion Drive",
        description: "A global campaign for influence.",
        gdpCostFraction: 0.0071,
      },
    ],
  },
  {
    id: "ca.defense.security.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "defense.security",
        weight: 1,
      },
    ],
    title: "Security Intelligence and Cyber Act",
    description: "Intelligence services and national security.",
    category: "defense",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Apparatus",
        description: "No security agencies.",
      },
      {
        name: "Security Foundations",
        description: "Basic intelligence and policing of threats.",
        gdpCostFraction: 0.0023,
      },
      {
        name: "Security Establishment",
        description: "Signals, security and cyber agencies.",
        gdpCostFraction: 0.0045,
      },
      {
        name: "Deep Security State",
        description: "Wide powers and reach across agencies.",
        gdpCostFraction: 0.0073,
      },
      {
        name: "Total Vigilance",
        description: "Comprehensive monitoring of every threat.",
        gdpCostFraction: 0.0109,
      },
    ],
  },
  {
    id: "ca.defense.defenseIndustry.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "defense.defenseIndustry",
        weight: 1,
      },
    ],
    title: "Defence Production and Procurement Act",
    description: "Domestic arms production and research.",
    category: "defense",
    allowedScope: "national",
    baselineLevel: 1,
    levels: [
      {
        name: "No Industrial Policy",
        description: "Equipment is bought abroad.",
      },
      {
        name: "Production Base",
        description: "A modest domestic production base.",
        gdpCostFraction: 0.0045,
      },
      {
        name: "Production and Research",
        description: "Procurement tied to domestic research and production.",
        gdpCostFraction: 0.0091,
      },
      {
        name: "Research and Production Drive",
        description: "Large investments in defence industry.",
        gdpCostFraction: 0.0146,
      },
      {
        name: "Full Mobilization Base",
        description: "The capacity to arm the country at scale.",
        gdpCostFraction: 0.0221,
      },
    ],
  },
  {
    id: "ca.defense.armedForces.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "defense.armedForces",
        weight: 1,
      },
    ],
    title: "Armed Forces Act",
    description: "The Canadian Armed Forces' size and readiness.",
    category: "defense",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "Skeleton Forces",
        description: "A token force.",
      },
      {
        name: "Regular Forces",
        description: "Small regular forces.",
        gdpCostFraction: 0.0202,
      },
      {
        name: "Strong Standing Forces",
        description: "Well-equipped standing forces.",
        gdpCostFraction: 0.0303,
      },
      {
        name: "Expanded Establishment",
        description: "A large establishment with deep reserves.",
        gdpCostFraction: 0.0429,
      },
      {
        name: "Mobilized Establishment",
        description: "A force sized for sustained high-intensity war.",
        gdpCostFraction: 0.0581,
      },
    ],
  },
  {
    id: "ca.defense.projection.primary",
    countryId: "CA",
    kind: "primary",
    targets: [
      {
        metricId: "defense.projection",
        weight: 1,
      },
    ],
    title: "Strategic Capabilities Act",
    description: "Long-range and strategic military capability.",
    category: "defense",
    allowedScope: "national",
    baselineLevel: 0,
    levels: [
      {
        name: "No Strategic Forces",
        description: "No long-range capability.",
      },
      {
        name: "Strategic Foundations",
        description: "Basic capability to reach beyond the border.",
        gdpCostFraction: 0.0056,
      },
      {
        name: "Deterrent Programme",
        description: "Credible conventional deterrence through allied systems.",
        gdpCostFraction: 0.0111,
      },
      {
        name: "Independent Capability",
        description: "Substantial independent long-range capability.",
        gdpCostFraction: 0.0177,
      },
      {
        name: "Great Power Arsenal",
        description: "A great-power arsenal.",
        gdpCostFraction: 0.0253,
      },
    ],
  },
  {
    id: "ca.sec.tradeCorridors",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "infrastructure.highways",
        weight: 0.5,
      },
      {
        metricId: "infrastructure.condition",
        weight: 0.4,
      },
      {
        metricId: "economy.productivity",
        weight: 0.3,
      },
      {
        metricId: "infrastructure.transit",
        weight: 0.25,
      },
    ],
    title: "Trade Corridors and Freight Act",
    description: "Ports, border crossings and rail and road freight.",
    category: "infrastructure",
    allowedScope: "national",
    baselineLevel: 1,
    levels: [
      {
        name: "No Programme",
        description: "Freight infrastructure is left to the market.",
      },
      {
        name: "Corridor Improvements",
        description: "Fixes at the worst bottlenecks.",
        gdpCostFraction: 0.00076,
      },
      {
        name: "Freight Modernization",
        description: "Port, rail and border upgrades.",
        gdpCostFraction: 0.0018,
      },
      {
        name: "National Logistics Drive",
        description: "A national plan to speed goods to market.",
        gdpCostFraction: 0.0032,
      },
      {
        name: "Continental Scale Freight",
        description: "World-class corridors linking every region.",
        gdpCostFraction: 0.005,
      },
    ],
  },
  {
    id: "ca.sec.veteransReestablishment",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "education.adultSkills",
        weight: 0.5,
      },
      {
        metricId: "infrastructure.ownership",
        weight: 0.4,
      },
      {
        metricId: "society.socialMobility",
        weight: 0.4,
      },
      {
        metricId: "education.attainment",
        weight: 0.3,
      },
    ],
    title: "Veterans Re-establishment Act",
    description: "Help for service members returning to civilian life.",
    category: "education",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Scheme",
        description: "No re-establishment help.",
      },
      {
        name: "Release Benefits",
        description: "A release allowance and counselling.",
        incomeCostFraction: 0.0016,
      },
      {
        name: "Training and Re-establishment",
        description: "Retraining and job placement.",
        incomeCostFraction: 0.0032,
      },
      {
        name: "Full Re-establishment Programme",
        description: "Education, housing and job support for every veteran.",
        incomeCostFraction: 0.0057,
      },
      {
        name: "Generational Programme",
        description: "Lifelong support for veterans and their families.",
        incomeCostFraction: 0.0086,
      },
    ],
  },
  {
    id: "ca.sec.eiExtension",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "health.socialInsurance",
        weight: 0.5,
      },
      {
        metricId: "economy.mobility",
        weight: 0.4,
      },
      {
        metricId: "society.familyStability",
        weight: 0.3,
      },
    ],
    title: "Employment Insurance Extension Act",
    description: "Extending unemployment and sickness cover to more workers.",
    category: "health",
    allowedScope: "national",
    baselineLevel: 1,
    budgetKeyOverride: "statePensions",
    levels: [
      {
        name: "No Extension",
        description: "Coverage stays narrow.",
      },
      {
        name: "Coverage Extension",
        description: "More workers qualify.",
        incomeCostFraction: 0.0022,
      },
      {
        name: "Benefit Uprating",
        description: "Benefits rise with wages.",
        incomeCostFraction: 0.0043,
      },
      {
        name: "Broad Extension",
        description: "Self-employed and gig workers are covered.",
        incomeCostFraction: 0.0072,
      },
      {
        name: "Universal Adequacy Drive",
        description: "Every worker is covered at an adequate level.",
        incomeCostFraction: 0.0108,
      },
    ],
  },
  {
    id: "ca.sec.nuclearProgramme",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "environment.energySecurity",
        weight: 0.5,
      },
      {
        metricId: "education.research",
        weight: 0.4,
      },
      {
        metricId: "defense.defenseIndustry",
        weight: 0.4,
      },
      {
        metricId: "defense.security",
        weight: 0.3,
      },
    ],
    title: "Nuclear Energy Programme Act",
    description: "Research reactors, uranium and nuclear power.",
    category: "environment",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Programme",
        description: "No public nuclear activity.",
      },
      {
        name: "Research Establishments",
        description: "Research reactors and isotopes.",
        gdpCostFraction: 0.0013,
      },
      {
        name: "Nuclear Establishment",
        description: "A national nuclear laboratory and power fleet.",
        gdpCostFraction: 0.0025,
      },
      {
        name: "Power and Medicine Complex",
        description: "New reactor builds and medical isotope supply.",
        gdpCostFraction: 0.0042,
      },
      {
        name: "Nuclear Leadership",
        description: "A leading nuclear exporter and operator.",
        gdpCostFraction: 0.0063,
      },
    ],
  },
  {
    id: "ca.sec.immigrationRefugee",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "society.integration",
        weight: 0.5,
      },
      {
        metricId: "order.dueProcess",
        weight: 0.4,
      },
      {
        metricId: "governance.participation",
        weight: 0.4,
      },
      {
        metricId: "order.communityTrust",
        weight: 0.3,
      },
      {
        metricId: "governance.centralAuthority",
        weight: 0.25,
      },
    ],
    title: "Immigration and Refugee Protection Act",
    description: "Rules for newcomers and refugees.",
    category: "society",
    allowedScope: "national",
    baselineLevel: 0,
    levels: [
      {
        name: "No Statutory Protections",
        description: "Newcomers have no statutory protections.",
      },
      {
        name: "Public Standing Rules",
        description: "Newcomers have basic legal standing.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Settlement Commission",
        description: "A body oversees settlement services.",
        gdpCostFraction: 0.0008,
      },
      {
        name: "Broad Enforcement",
        description: "Strong enforcement of newcomer rights and services.",
        gdpCostFraction: 0.0014,
      },
      {
        name: "Full Standing Charter",
        description: "Full settlement support and a path to citizenship.",
        gdpCostFraction: 0.0021,
      },
    ],
  },
  {
    id: "ca.sec.ruralNorthern",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "infrastructure.utilities",
        weight: 0.5,
      },
      {
        metricId: "economy.mobility",
        weight: 0.3,
      },
      {
        metricId: "environment.stewardship",
        weight: 0.3,
      },
      {
        metricId: "society.demography",
        weight: 0.25,
      },
    ],
    title: "Rural and Northern Development Act",
    description: "Services and development for remote and northern communities.",
    category: "infrastructure",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Programme",
        description: "Rural areas fend for themselves.",
      },
      {
        name: "Rural Boards",
        description: "Development agencies fund local projects.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Hydro and Development Agencies",
        description: "Regional agencies drive power and economic projects.",
        gdpCostFraction: 0.00076,
      },
      {
        name: "Countryside Modernization",
        description: "Roads, broadband and services reach rural areas.",
        gdpCostFraction: 0.0014,
      },
      {
        name: "Rural Renaissance Drive",
        description: "A national program for rural and northern renewal.",
        gdpCostFraction: 0.0021,
      },
    ],
  },
  {
    id: "ca.sec.farmSupplyManagement",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "economy.mobility",
        weight: 0.5,
      },
      {
        metricId: "environment.stewardship",
        weight: 0.4,
      },
      {
        metricId: "economy.stability",
        weight: 0.3,
      },
      {
        metricId: "economy.householdIncome",
        weight: 0.3,
      },
    ],
    title: "Farm Income and Supply Management Act",
    description: "Support for farmers through quotas and income programs.",
    category: "economy",
    allowedScope: "national",
    baselineLevel: 3,
    levels: [
      {
        name: "No Farm Support",
        description: "Farmers face the market alone.",
      },
      {
        name: "Marketing Boards",
        description: "Marketing boards pool and sell farm output.",
        incomeCostFraction: 0.0029,
      },
      {
        name: "Price Guarantees",
        description: "Guaranteed prices for key products.",
        incomeCostFraction: 0.0057,
      },
      {
        name: "Supply Management System",
        description: "Quotas and tariffs stabilize dairy, poultry and eggs.",
        incomeCostFraction: 0.01,
      },
      {
        name: "Full Parity Guarantee",
        description: "Farm incomes are guaranteed to match other workers.",
        incomeCostFraction: 0.0143,
      },
    ],
  },
  {
    id: "ca.sec.urbanRenewal",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "infrastructure.publicHousing",
        weight: 0.5,
      },
      {
        metricId: "infrastructure.development",
        weight: 0.4,
      },
      {
        metricId: "environment.urbanAir",
        weight: 0.3,
      },
      {
        metricId: "order.safety",
        weight: 0.25,
      },
      {
        metricId: "infrastructure.ownership",
        weight: 0.25,
      },
    ],
    title: "Urban Renewal and Housing Supply Act",
    description: "Redevelopment of run-down neighbourhoods and new supply.",
    category: "infrastructure",
    allowedScope: "both",
    baselineLevel: 2,
    budgetKeyOverride: "other",
    levels: [
      {
        name: "No Programme",
        description: "Run-down areas are left alone.",
      },
      {
        name: "Clearance Orders",
        description: "Orders to demolish the worst buildings.",
        gdpCostFraction: 0.0011,
      },
      {
        name: "Renewal and Infill",
        description: "Redevelopment with new infill housing.",
        gdpCostFraction: 0.0023,
      },
      {
        name: "Comprehensive Redevelopment",
        description: "Whole districts are rebuilt.",
        gdpCostFraction: 0.0039,
      },
      {
        name: "Cities Rebuilt Drive",
        description: "A national drive to rebuild cities.",
        gdpCostFraction: 0.006,
      },
    ],
  },
  {
    id: "ca.sec.labourRelations",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "economy.workerSecurity",
        weight: 0.5,
      },
      {
        metricId: "economy.productivity",
        weight: 0.3,
      },
      {
        metricId: "economy.stability",
        weight: 0.25,
      },
      {
        metricId: "society.civicLife",
        weight: 0.25,
      },
    ],
    title: "Labour Relations Act",
    description: "Unions, bargaining and strikes.",
    category: "economy",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Framework",
        description: "Labour relations have no statute.",
      },
      {
        name: "Conciliation Service",
        description: "Mediators help parties settle.",
        gdpCostFraction: 0.0001,
      },
      {
        name: "Bargaining Framework",
        description: "A legal right to organize and bargain.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Strong Bargaining Order",
        description: "Card-check certification and anti-scab rules.",
        gdpCostFraction: 0.0003,
      },
      {
        name: "Industrial Peace Charter",
        description: "Comprehensive structures prevent and settle disputes.",
        gdpCostFraction: 0.0004,
      },
    ],
  },
  {
    id: "ca.sec.universityFunding",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "education.research",
        weight: 0.5,
      },
      {
        metricId: "education.attainment",
        weight: 0.3,
      },
      {
        metricId: "defense.defenseIndustry",
        weight: 0.3,
      },
      {
        metricId: "education.standards",
        weight: 0.25,
      },
    ],
    title: "University Funding Act",
    description: "Operating and capital funds for universities.",
    category: "education",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Committee",
        description: "No federal university funding.",
      },
      {
        name: "Grants Office",
        description: "A small grants office.",
        gdpCostFraction: 0.0003,
      },
      {
        name: "Funding Council",
        description: "A council allocates funds.",
        gdpCostFraction: 0.0006,
      },
      {
        name: "Expanded Fellowships",
        description: "Scholarships and fellowships expand.",
        gdpCostFraction: 0.0011,
      },
      {
        name: "National University Push",
        description: "A national push to expand and excel.",
        gdpCostFraction: 0.0017,
      },
    ],
  },
  {
    id: "ca.sec.hospitalCapital",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "health.universalCare",
        weight: 0.5,
      },
      {
        metricId: "health.outcomes",
        weight: 0.4,
      },
      {
        metricId: "health.prevention",
        weight: 0.35,
      },
    ],
    title: "Hospital Capital Programme Act",
    description: "Building and renewing hospitals.",
    category: "health",
    allowedScope: "both",
    baselineLevel: 1,
    levels: [
      {
        name: "No Programme",
        description: "No hospital construction funds.",
      },
      {
        name: "Repairs and Extensions",
        description: "Repairs and small additions.",
        gdpCostFraction: 0.001,
      },
      {
        name: "Building Programme",
        description: "A steady programme of new hospitals.",
        gdpCostFraction: 0.002,
      },
      {
        name: "Regional Hospital Plan",
        description: "Hospitals planned for every region.",
        gdpCostFraction: 0.0035,
      },
      {
        name: "Universal Bed Standard",
        description: "A national standard of beds per capita.",
        gdpCostFraction: 0.0053,
      },
    ],
  },
  {
    id: "ca.sec.mergerReview",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "economy.competition",
        weight: 0.5,
      },
      {
        metricId: "economy.productivity",
        weight: 0.3,
      },
      {
        metricId: "governance.administration",
        weight: 0.25,
      },
      {
        metricId: "economy.householdIncome",
        weight: 0.25,
      },
    ],
    title: "Mergers and Acquisitions Review Act",
    description: "Review of big takeovers and market concentration.",
    category: "economy",
    allowedScope: "national",
    baselineLevel: 1,
    levels: [
      {
        name: "No Review",
        description: "Mergers proceed freely.",
      },
      {
        name: "Notification",
        description: "Large deals are notified.",
        gdpCostFraction: 0.00015,
      },
      {
        name: "Review with Powers",
        description: "A tribunal can block or condition deals.",
        gdpCostFraction: 0.0003,
      },
      {
        name: "Active Market Policing",
        description: "Frequent challenges to concentration.",
        gdpCostFraction: 0.0005,
      },
      {
        name: "Open Commerce Charter",
        description: "Strong presumption against concentrated markets.",
        gdpCostFraction: 0.0008,
      },
    ],
  },
  {
    id: "ca.sec.immigrationLevels",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "society.demography",
        weight: 0.5,
      },
      {
        metricId: "society.integration",
        weight: 0.35,
      },
      {
        metricId: "education.adultSkills",
        weight: 0.25,
      },
      {
        metricId: "society.tradition",
        weight: 0.25,
      },
    ],
    title: "Citizenship and Immigration Levels Act",
    description: "Annual immigration targets and citizenship rules.",
    category: "society",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "Closed Door",
        description: "Immigration is nearly stopped.",
      },
      {
        name: "Restricted Entry",
        description: "Low levels with strict criteria.",
        gdpCostFraction: 0.0001,
      },
      {
        name: "Managed Levels",
        description: "Moderate, skills-based levels.",
        gdpCostFraction: 0.00025,
      },
      {
        name: "Managed Expansion",
        description: "High levels with strong settlement support.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Open Door Policy",
        description: "Very high levels and easy citizenship.",
        gdpCostFraction: 0.0006,
      },
    ],
  },
  {
    id: "ca.sec.justiceAdministration",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "order.courts",
        weight: 0.5,
      },
      {
        metricId: "order.legalAid",
        weight: 0.5,
      },
      {
        metricId: "governance.integrity",
        weight: 0.3,
      },
    ],
    title: "Justice Administration Act",
    description: "Court staff, registries and the machinery of justice.",
    category: "order",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Programme",
        description: "No central administration.",
      },
      {
        name: "Court Administration",
        description: "Basic administration of courts.",
        gdpCostFraction: 0.00015,
      },
      {
        name: "Justice Administration",
        description: "Modern, professional registries.",
        gdpCostFraction: 0.0003,
      },
      {
        name: "Expanded Access Programme",
        description: "Wider access and circuit courts.",
        gdpCostFraction: 0.0005,
      },
      {
        name: "Model Justice System",
        description: "An exemplary system of administration.",
        gdpCostFraction: 0.0008,
      },
    ],
  },
  {
    id: "ca.sec.correctionsRehabilitation",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "order.deterrence",
        weight: 0.5,
      },
      {
        metricId: "order.safety",
        weight: 0.35,
      },
      {
        metricId: "order.legalAid",
        weight: 0.25,
      },
      {
        metricId: "order.dueProcess",
        weight: 0.25,
      },
    ],
    title: "Corrections and Rehabilitation Act",
    description: "Youth justice and prison rehabilitation.",
    category: "order",
    allowedScope: "both",
    baselineLevel: 2,
    levels: [
      {
        name: "No Reform",
        description: "No change to custody.",
      },
      {
        name: "Basic Standards",
        description: "Minimum standards in custody.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Youth Justice System",
        description: "A separate youth justice system.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Modern Corrections",
        description: "Education, treatment and reintegration programs.",
        gdpCostFraction: 0.0007,
      },
      {
        name: "Model Corrections System",
        description: "A model system focused on rehabilitation.",
        gdpCostFraction: 0.0011,
      },
    ],
  },
  {
    id: "ca.sec.federalPolicingExpansion",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "order.policeStrength",
        weight: 0.5,
      },
      {
        metricId: "order.safety",
        weight: 0.4,
      },
      {
        metricId: "defense.security",
        weight: 0.3,
      },
      {
        metricId: "governance.centralAuthority",
        weight: 0.25,
      },
      {
        metricId: "order.deterrence",
        weight: 0.25,
      },
    ],
    title: "Federal Policing and Intelligence Expansion Act",
    description: "More federal investigators and intelligence officers.",
    category: "order",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Expansion",
        description: "Federal policing stays small.",
      },
      {
        name: "Regional Offices",
        description: "New federal offices.",
        gdpCostFraction: 0.0001,
      },
      {
        name: "Federal Expansion",
        description: "More federal investigators.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "National Coordination",
        description: "A national intelligence-led policing network.",
        gdpCostFraction: 0.00035,
      },
      {
        name: "Saturation Coverage",
        description: "Federal presence everywhere.",
        gdpCostFraction: 0.0005,
      },
    ],
  },
  {
    id: "ca.sec.trailsRecreation",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "environment.stewardship",
        weight: 0.5,
      },
      {
        metricId: "environment.conservation",
        weight: 0.5,
      },
      {
        metricId: "society.civicLife",
        weight: 0.25,
      },
    ],
    title: "Trails and Outdoor Recreation Act",
    description: "Hiking, camping and outdoor access.",
    category: "environment",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Programme",
        description: "Access is left to landowners.",
      },
      {
        name: "Parks Maintained",
        description: "Parks are kept open.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Parks and Trails",
        description: "A funded network of parks and trails.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Large Scale Investment",
        description: "Major investment in outdoor infrastructure.",
        gdpCostFraction: 0.0007,
      },
      {
        name: "Crown Jewels Standard",
        description: "The finest outdoor recreation system in the world.",
        gdpCostFraction: 0.001,
      },
    ],
  },
  {
    id: "ca.sec.cleanWater",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "environment.urbanAir",
        weight: 0.5,
      },
      {
        metricId: "environment.conservation",
        weight: 0.4,
      },
      {
        metricId: "health.prevention",
        weight: 0.3,
      },
      {
        metricId: "infrastructure.utilities",
        weight: 0.25,
      },
    ],
    title: "Clean Water and Wastewater Act",
    description: "Drinking water and sewage treatment.",
    category: "environment",
    allowedScope: "both",
    baselineLevel: 1,
    levels: [
      {
        name: "No Programme",
        description: "No federal water funding.",
      },
      {
        name: "Treatment Grants",
        description: "Grants for treatment plants.",
        gdpCostFraction: 0.0005,
      },
      {
        name: "Water Programme",
        description: "A steady program to upgrade systems.",
        gdpCostFraction: 0.001,
      },
      {
        name: "Clean Waters Drive",
        description: "Accelerated upgrades, including for First Nations.",
        gdpCostFraction: 0.0018,
      },
      {
        name: "Every River Swimmable",
        description: "A national goal of clean water everywhere.",
        gdpCostFraction: 0.0027,
      },
    ],
  },
  {
    id: "ca.sec.emergencyManagement",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "defense.security",
        weight: 0.4,
      },
      {
        metricId: "environment.energySecurity",
        weight: 0.3,
      },
      {
        metricId: "infrastructure.condition",
        weight: 0.3,
      },
      {
        metricId: "order.policeStrength",
        weight: 0.25,
      },
      {
        metricId: "governance.decisiveness",
        weight: 0.25,
      },
    ],
    title: "Emergency Management Act",
    description: "Floods, wildfires, storms and other emergencies.",
    category: "defense",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Programme",
        description: "Emergencies are handled ad hoc.",
      },
      {
        name: "Warning Systems",
        description: "Public alerting and warning systems.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Emergency Management Agency",
        description: "A national agency coordinates response.",
        gdpCostFraction: 0.00076,
      },
      {
        name: "Resilience and Continuity",
        description: "Shelters, stockpiles and continuity planning.",
        gdpCostFraction: 0.0013,
      },
      {
        name: "Total Preparedness",
        description: "Every community is ready for every hazard.",
        gdpCostFraction: 0.002,
      },
    ],
  },
  {
    id: "ca.sec.electionsAdministration",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "governance.participation",
        weight: 0.5,
      },
      {
        metricId: "governance.openness",
        weight: 0.3,
      },
      {
        metricId: "governance.integrity",
        weight: 0.3,
      },
      {
        metricId: "governance.localAutonomy",
        weight: 0.25,
      },
    ],
    title: "Elections Administration Act",
    description: "Running federal elections.",
    category: "governance",
    allowedScope: "national",
    baselineLevel: 1,
    levels: [
      {
        name: "No Standards",
        description: "No national standards.",
      },
      {
        name: "Returning Officer Standards",
        description: "Training for election officers.",
        gdpCostFraction: 0.0001,
      },
      {
        name: "National Standards",
        description: "Common standards across ridings.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Enforcement Machinery",
        description: "An enforcement agency investigates breaches.",
        gdpCostFraction: 0.0003,
      },
      {
        name: "Full Guarantee Regime",
        description: "Strong guarantees of free and fair elections.",
        gdpCostFraction: 0.00045,
      },
    ],
  },
  {
    id: "ca.sec.governmentReorganization",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "governance.administration",
        weight: 0.5,
      },
      {
        metricId: "governance.decisiveness",
        weight: 0.4,
      },
      {
        metricId: "economy.fiscal",
        weight: 0.3,
      },
      {
        metricId: "governance.integrity",
        weight: 0.25,
      },
      {
        metricId: "order.courts",
        weight: 0.25,
      },
    ],
    title: "Government Reorganization Act",
    description: "Creating, merging and closing departments.",
    category: "governance",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Authority",
        description: "Departments are fixed in law.",
      },
      {
        name: "Review Committees",
        description: "Committees review structure.",
        gdpCostFraction: 0.0001,
      },
      {
        name: "Reorganization Authority",
        description: "The government may reshape departments.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Sweeping Consolidation",
        description: "Large mergers cut overlap.",
        gdpCostFraction: 0.0003,
      },
      {
        name: "Continuous Reform Mandate",
        description: "A standing mandate to keep reforming.",
        gdpCostFraction: 0.00045,
      },
    ],
  },
  {
    id: "ca.sec.publicBroadcasting",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "governance.openness",
        weight: 0.5,
      },
      {
        metricId: "defense.softPower",
        weight: 0.3,
      },
      {
        metricId: "society.civicLife",
        weight: 0.3,
      },
      {
        metricId: "order.communityTrust",
        weight: 0.25,
      },
    ],
    title: "Public Broadcasting Act",
    description: "The public broadcaster and its mandate.",
    category: "governance",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Public Broadcasting",
        description: "No public broadcaster.",
      },
      {
        name: "Radio Service",
        description: "A national radio service.",
        gdpCostFraction: 0.0003,
      },
      {
        name: "Broadcasting Mandate",
        description: "Radio and television with a public mandate.",
        gdpCostFraction: 0.0006,
      },
      {
        name: "Digital Expansion",
        description: "Online and regional services expand.",
        gdpCostFraction: 0.001,
      },
      {
        name: "Full Public Service Media",
        description:
          "A fully funded public media service in both languages and Indigenous languages.",
        gdpCostFraction: 0.0015,
      },
    ],
  },
  {
    id: "ca.sec.internationalDevelopment",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "defense.institutions",
        weight: 0.5,
      },
      {
        metricId: "defense.diplomacy",
        weight: 0.4,
      },
      {
        metricId: "defense.softPower",
        weight: 0.4,
      },
    ],
    title: "International Development Assistance Act",
    description: "Foreign aid.",
    category: "defense",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Aid",
        description: "No development assistance.",
      },
      {
        name: "Relief Assistance",
        description: "Disaster and humanitarian relief.",
        gdpCostFraction: 0.0008,
      },
      {
        name: "Development Programmes",
        description: "Funded long-term development programs.",
        gdpCostFraction: 0.0015,
      },
      {
        name: "Global Development Drive",
        description: "A large, feminist and climate-focused aid effort.",
        gdpCostFraction: 0.0025,
      },
      {
        name: "Development Underwriting",
        description: "Underwriting global development goals.",
        gdpCostFraction: 0.0038,
      },
    ],
  },
  {
    id: "ca.sec.natoNorad",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "defense.diplomacy",
        weight: 0.5,
      },
      {
        metricId: "defense.armedForces",
        weight: 0.3,
      },
      {
        metricId: "defense.projection",
        weight: 0.3,
      },
      {
        metricId: "defense.institutions",
        weight: 0.3,
      },
    ],
    title: "NATO and Continental Defence Act",
    description: "Alliance commitments and continental defence.",
    category: "defense",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Alliances",
        description: "No alliance commitments.",
      },
      {
        name: "Regional Pacts",
        description: "Participation in regional pacts.",
        gdpCostFraction: 0.0006,
      },
      {
        name: "Alliance System",
        description: "Full membership and cooperation in NATO and NORAD.",
        gdpCostFraction: 0.0013,
      },
      {
        name: "Integrated Commands",
        description: "Forces integrated into allied commands.",
        gdpCostFraction: 0.0022,
      },
      {
        name: "Global Alliance Web",
        description: "A global web of alliances.",
        gdpCostFraction: 0.0033,
      },
    ],
  },
  {
    id: "ca.sec.reservesRangers",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "defense.armedForces",
        weight: 0.5,
      },
      {
        metricId: "defense.projection",
        weight: 0.35,
      },
      {
        metricId: "defense.defenseIndustry",
        weight: 0.25,
      },
    ],
    title: "Reserve Forces and Rangers Act",
    description: "Part-time soldiers and northern rangers.",
    category: "defense",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Reserve System",
        description: "No reserves.",
      },
      {
        name: "Reserve Units",
        description: "Reserve units in major cities.",
        gdpCostFraction: 0.0009,
      },
      {
        name: "Ready Reserve System",
        description: "Trained and ready reserves.",
        gdpCostFraction: 0.0018,
      },
      {
        name: "Deep Reserve Structure",
        description: "Deep reserves with northern rangers.",
        gdpCostFraction: 0.003,
      },
      {
        name: "Nation in Arms",
        description: "A mobilized citizenry.",
        gdpCostFraction: 0.0045,
      },
    ],
  },
  {
    id: "ca.sec.criticalMinerals",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "environment.resourceDev",
        weight: 0.5,
      },
      {
        metricId: "environment.extraction",
        weight: 0.4,
      },
      {
        metricId: "environment.energySecurity",
        weight: 0.3,
      },
    ],
    title: "Critical Minerals and Supply Security Act",
    description: "Strategic stocks of vital materials.",
    category: "environment",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Stockpiles",
        description: "No stockpiles.",
      },
      {
        name: "Critical Materials List",
        description: "A list of critical materials.",
        gdpCostFraction: 0.0005,
      },
      {
        name: "Strategic Stockpile",
        description: "A stockpile of key materials.",
        gdpCostFraction: 0.001,
      },
      {
        name: "Deep Reserves",
        description: "Deep reserves and secure supply chains.",
        gdpCostFraction: 0.0017,
      },
      {
        name: "Total Material Security",
        description: "Complete security of supply.",
        gdpCostFraction: 0.0025,
      },
    ],
  },
  {
    id: "ca.sec.aggregatesMinerals",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "environment.extraction",
        weight: 0.5,
      },
      {
        metricId: "environment.resourceDev",
        weight: 0.4,
      },
      {
        metricId: "environment.affordability",
        weight: 0.3,
      },
    ],
    title: "Aggregates and Minerals Act",
    description: "Quarries, aggregates and mine permits.",
    category: "environment",
    allowedScope: "national",
    baselineLevel: 1,
    levels: [
      {
        name: "Grounds Withdrawn",
        description: "Lands are withdrawn from use.",
      },
      {
        name: "Licensing Programme",
        description: "A licensing scheme.",
        gdpCostFraction: 0.0001,
        gdpRevenueFraction: 0.00015,
      },
      {
        name: "Expanded Access",
        description: "Wider access to aggregates and deposits.",
        gdpCostFraction: 0.00015,
        gdpRevenueFraction: 0.0002,
      },
      {
        name: "Development Priority",
        description: "Priority for approval of mines.",
        gdpCostFraction: 0.0002,
        gdpRevenueFraction: 0.0003,
      },
      {
        name: "Full Multiple Use",
        description: "Mining is allowed alongside other uses.",
        gdpCostFraction: 0.00025,
        gdpRevenueFraction: 0.0004,
      },
    ],
  },
  {
    id: "ca.sec.energyRegulator",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "environment.affordability",
        weight: 0.5,
      },
      {
        metricId: "infrastructure.utilities",
        weight: 0.25,
      },
      {
        metricId: "economy.stability",
        weight: 0.25,
      },
    ],
    title: "Energy Regulator Act",
    description: "Regulation of pipelines and energy markets.",
    category: "environment",
    allowedScope: "national",
    baselineLevel: 1,
    levels: [
      {
        name: "No Regulation",
        description: "Energy markets are unregulated.",
      },
      {
        name: "Tariff Oversight",
        description: "The regulator reviews tariffs.",
        gdpCostFraction: 0.00015,
      },
      {
        name: "Board Regulation",
        description: "A board regulates pipelines and power.",
        gdpCostFraction: 0.0003,
      },
      {
        name: "Price Stabilization",
        description: "The regulator damps price spikes.",
        gdpCostFraction: 0.0005,
      },
      {
        name: "Full Price Control",
        description: "Prices are controlled.",
        gdpCostFraction: 0.0007,
      },
    ],
  },
  {
    id: "ca.sec.schoolFood",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "education.universalSchooling",
        weight: 0.5,
      },
      {
        metricId: "education.teacherCorps",
        weight: 0.5,
      },
      {
        metricId: "education.attainment",
        weight: 0.3,
      },
    ],
    title: "School Food Programme Act",
    description: "Meals for students at school.",
    category: "education",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Provision",
        description: "No school food.",
      },
      {
        name: "Snacks and Milk",
        description: "Milk and snacks for needy students.",
        incomeCostFraction: 0.0014,
      },
      {
        name: "Meals Service",
        description: "A nutritious meal in most schools.",
        incomeCostFraction: 0.0029,
      },
      {
        name: "Universal Free Provision",
        description: "Free meals for every student.",
        incomeCostFraction: 0.005,
      },
      {
        name: "Full Welfare in Schools",
        description: "Meals, health checks and supports at school.",
        incomeCostFraction: 0.0072,
      },
    ],
  },
  {
    id: "ca.sec.credentialRecognition",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "education.standards",
        weight: 0.4,
      },
      {
        metricId: "education.universalSchooling",
        weight: 0.3,
      },
      {
        metricId: "education.adultSkills",
        weight: 0.3,
      },
      {
        metricId: "education.choice",
        weight: 0.25,
      },
    ],
    title: "Credential Recognition and Vocational Standards Act",
    description: "National standards for trades and credentials.",
    category: "education",
    allowedScope: "national",
    baselineLevel: 1,
    levels: [
      {
        name: "No Standards",
        description: "Credentials are not coordinated.",
      },
      {
        name: "Model Standards",
        description: "Model standards that provinces may adopt.",
        gdpCostFraction: 0.00025,
      },
      {
        name: "Certificate System",
        description: "Certified trades and credentials.",
        gdpCostFraction: 0.0005,
      },
      {
        name: "Red Seal Standards",
        description: "Interprovincial trade standards.",
        gdpCostFraction: 0.0008,
      },
      {
        name: "Universal Standards",
        description: "Credentials are recognized everywhere.",
        gdpCostFraction: 0.0012,
      },
    ],
  },
  {
    id: "ca.sec.independentSchoolsFunding",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "education.choice",
        weight: 0.5,
      },
      {
        metricId: "society.socialMobility",
        weight: 0.3,
      },
      {
        metricId: "society.tradition",
        weight: 0.25,
      },
      {
        metricId: "education.teacherCorps",
        weight: 0.25,
      },
    ],
    title: "Independent Schools Funding Act",
    description: "Public money for independent schools.",
    category: "education",
    allowedScope: "national",
    baselineLevel: 1,
    levels: [
      {
        name: "No Programmes",
        description: "No public funds.",
      },
      {
        name: "Bursary Fund",
        description: "A fund for needy students at independent schools.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Funding System",
        description: "A funding system for independent schools.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Broad Choice Support",
        description: "Funding for most families who choose independent schools.",
        gdpCostFraction: 0.0007,
      },
      {
        name: "Full Choice Funding",
        description: "Full funding for any chosen school.",
        gdpCostFraction: 0.0011,
      },
    ],
  },
  {
    id: "ca.sec.parentalBenefits",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "society.familyStability",
        weight: 0.5,
      },
      {
        metricId: "society.womensOpportunity",
        weight: 0.4,
      },
      {
        metricId: "society.demography",
        weight: 0.3,
      },
    ],
    title: "Maternity and Parental Benefits Act",
    description: "Leave and care around birth.",
    category: "society",
    allowedScope: "national",
    baselineLevel: 2,
    budgetKeyOverride: "welfare",
    levels: [
      {
        name: "No Programmes",
        description: "No benefits.",
      },
      {
        name: "Maternity Services",
        description: "Basic maternity services.",
        incomeCostFraction: 0.0013,
      },
      {
        name: "Maternity and Parental Leave",
        description: "Paid leave for both parents.",
        incomeCostFraction: 0.0025,
      },
      {
        name: "Family Services System",
        description: "Home visits and early learning.",
        incomeCostFraction: 0.0043,
      },
      {
        name: "Universal Family Support",
        description: "A universal system of support for new families.",
        incomeCostFraction: 0.0065,
      },
    ],
  },
  {
    id: "ca.sec.payEquity",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "society.womensOpportunity",
        weight: 0.5,
      },
      {
        metricId: "society.integration",
        weight: 0.3,
      },
      {
        metricId: "economy.workerSecurity",
        weight: 0.3,
      },
    ],
    title: "Pay Equity Implementation Act",
    description: "Enforcing equal pay for work of equal value.",
    category: "society",
    allowedScope: "national",
    baselineLevel: 0,
    levels: [
      {
        name: "No Implementation",
        description: "No pay equity law.",
      },
      {
        name: "Federal Public Service Equal Pay",
        description: "Pay equity in the federal public service.",
        gdpCostFraction: 0.0001,
      },
      {
        name: "Federal Sector Equal Pay",
        description: "Equal pay in all federally regulated sectors.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Enforcement Powers",
        description: "A commissioner with strong enforcement powers.",
        gdpCostFraction: 0.00035,
      },
      {
        name: "Full Employment Equality",
        description: "Equal pay across the economy.",
        gdpCostFraction: 0.0005,
      },
    ],
  },
  {
    id: "ca.sec.exportDevelopment",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "economy.competition",
        weight: 0.45,
      },
      {
        metricId: "economy.fiscal",
        weight: 0.3,
      },
      {
        metricId: "economy.householdIncome",
        weight: 0.3,
      },
    ],
    title: "Export Development and Trade Act",
    description: "Export credit and trade promotion.",
    category: "economy",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Programmes",
        description: "No export support.",
      },
      {
        name: "Credit Guarantees",
        description: "Credit guarantees for exporters.",
        gdpCostFraction: 0.0003,
      },
      {
        name: "Export Development Agency",
        description: "A Crown agency finances exports.",
        gdpCostFraction: 0.0006,
      },
      {
        name: "Expanded Guarantees",
        description: "Wider financing and trade offices.",
        gdpCostFraction: 0.001,
      },
      {
        name: "Enterprise Nation Drive",
        description: "A national drive for exports.",
        gdpCostFraction: 0.0015,
      },
    ],
  },
  {
    id: "ca.sec.veteransBenefits",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "health.socialInsurance",
        weight: 0.4,
      },
      {
        metricId: "health.universalCare",
        weight: 0.3,
      },
      {
        metricId: "health.outcomes",
        weight: 0.3,
      },
    ],
    title: "Veterans Benefits and Health Act",
    description: "Pensions and care for veterans.",
    category: "health",
    allowedScope: "national",
    baselineLevel: 2,
    budgetKeyOverride: "statePensions",
    levels: [
      {
        name: "No Programmes",
        description: "No benefits.",
      },
      {
        name: "Service Pensions",
        description: "Pensions for injured veterans.",
        incomeCostFraction: 0.0022,
      },
      {
        name: "Pensions and Treatment",
        description: "Pensions and treatment.",
        incomeCostFraction: 0.0043,
      },
      {
        name: "Expanded Care System",
        description: "Care, rehabilitation and mental health.",
        incomeCostFraction: 0.0072,
      },
      {
        name: "Full Veterans Guarantee",
        description: "Full lifelong care for all veterans.",
        incomeCostFraction: 0.0108,
      },
    ],
  },
  {
    id: "ca.sec.healthResearch",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "health.outcomes",
        weight: 0.4,
      },
      {
        metricId: "health.systemEfficiency",
        weight: 0.4,
      },
      {
        metricId: "health.providerChoice",
        weight: 0.3,
      },
      {
        metricId: "education.research",
        weight: 0.25,
      },
    ],
    title: "Health Research Act",
    description: "Funding for biomedical and health research.",
    category: "health",
    allowedScope: "national",
    baselineLevel: 2,
    levels: [
      {
        name: "No Council",
        description: "No health research funds.",
      },
      {
        name: "Research Units",
        description: "Small research units.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Research Institutes",
        description: "An institute system funds research.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Disease Missions",
        description: "Large coordinated missions against disease.",
        gdpCostFraction: 0.0007,
      },
      {
        name: "Conquest of Disease Drive",
        description: "A national drive to defeat disease.",
        gdpCostFraction: 0.001,
      },
    ],
  },
  {
    id: "ca.sec.privateHealthBenefits",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "health.providerChoice",
        weight: 0.5,
      },
      {
        metricId: "health.responsibility",
        weight: 0.4,
      },
      {
        metricId: "health.systemEfficiency",
        weight: 0.3,
      },
      {
        metricId: "health.socialInsurance",
        weight: 0.25,
      },
    ],
    title: "Private Health Benefits Act",
    description: "Employer plans and supplementary insurance.",
    category: "health",
    allowedScope: "national",
    baselineLevel: 1,
    levels: [
      {
        name: "No Framework",
        description: "No rules for private benefits.",
      },
      {
        name: "Plans Recognized",
        description: "Employer plans are recognized.",
        gdpCostFraction: 0.0001,
      },
      {
        name: "Benefits Market Rules",
        description: "Rules for a private benefits market.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Portable Benefits",
        description: "Benefits travel with workers.",
        gdpCostFraction: 0.0003,
      },
      {
        name: "Open Benefits Market",
        description: "An open market in benefits.",
        gdpCostFraction: 0.00045,
      },
    ],
  },
  {
    id: "ca.sec.socialAssistanceReform",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "health.responsibility",
        weight: 0.5,
      },
      {
        metricId: "governance.administration",
        weight: 0.3,
      },
      {
        metricId: "society.familyStability",
        weight: 0.25,
      },
    ],
    title: "Social Assistance Reform Act",
    description: "Welfare eligibility and work links.",
    category: "health",
    allowedScope: "national",
    baselineLevel: 1,
    levels: [
      {
        name: "No Reform",
        description: "No change to welfare.",
      },
      {
        name: "Eligibility Review",
        description: "A review of eligibility.",
        gdpCostFraction: 0.0001,
      },
      {
        name: "Casework Standards",
        description: "Common casework standards.",
        gdpCostFraction: 0.0002,
      },
      {
        name: "Work Linked Assistance",
        description: "Assistance linked to work and training.",
        gdpCostFraction: 0.0003,
      },
      {
        name: "Full Conditionality",
        description: "Assistance strictly conditional.",
        gdpCostFraction: 0.00045,
      },
    ],
  },
  {
    id: "ca.sec.newCommunities",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "infrastructure.publicHousing",
        weight: 0.4,
      },
      {
        metricId: "infrastructure.condition",
        weight: 0.3,
      },
      {
        metricId: "governance.localAutonomy",
        weight: 0.3,
      },
      {
        metricId: "infrastructure.development",
        weight: 0.25,
      },
    ],
    title: "New Communities Act",
    description: "Planned new towns and growth centres.",
    category: "infrastructure",
    allowedScope: "national",
    baselineLevel: 2,
    budgetKeyOverride: "other",
    levels: [
      {
        name: "No Programme",
        description: "No new communities.",
      },
      {
        name: "First Designations",
        description: "The first sites are designated.",
        gdpCostFraction: 0.0009,
      },
      {
        name: "New Communities Programme",
        description: "A programme of new communities.",
        gdpCostFraction: 0.0018,
      },
      {
        name: "Second Generation",
        description: "A second round of larger sites.",
        gdpCostFraction: 0.003,
      },
      {
        name: "Model Towns Drive",
        description: "A national drive for model towns.",
        gdpCostFraction: 0.0045,
      },
    ],
  },
  {
    id: "ca.sec.urbanTransitOperating",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "infrastructure.transit",
        weight: 0.5,
      },
      {
        metricId: "infrastructure.highways",
        weight: 0.3,
      },
      {
        metricId: "infrastructure.publicHousing",
        weight: 0.25,
      },
    ],
    title: "Urban Transit Operating Act",
    description: "Operating support for city buses and trains.",
    category: "infrastructure",
    allowedScope: "both",
    baselineLevel: 1,
    levels: [
      {
        name: "No Programme",
        description: "No support for city transit.",
      },
      {
        name: "Operating Support",
        description: "Operating subsidies.",
        gdpCostFraction: 0.0004,
      },
      {
        name: "Fleet Investment",
        description: "Funds to renew fleets.",
        gdpCostFraction: 0.0008,
      },
      {
        name: "Metropolitan Programme",
        description: "A programme for the largest metropolitan regions.",
        gdpCostFraction: 0.0014,
      },
      {
        name: "Transit Renaissance",
        description: "A renewal of transit in every city.",
        gdpCostFraction: 0.0021,
      },
    ],
  },
  {
    id: "ca.sec.intelligenceFund",
    countryId: "CA",
    kind: "secondary",
    targets: [
      {
        metricId: "defense.institutions",
        weight: 0.6,
      },
      {
        metricId: "defense.projection",
        weight: 0.35,
      },
      {
        metricId: "governance.centralAuthority",
        weight: 0.3,
      },
    ],
    title: "National Security Intelligence Fund Act",
    description: "Classified intelligence funding.",
    category: "defense",
    allowedScope: "national",
    baselineLevel: 0,
    budgetKeyOverride: "intelligence",
    levels: [
      {
        name: "Unfunded",
        description: "No funds.",
      },
      {
        name: "Nominal Provision",
        description: "A small fund.",
        gdpCostFraction: 0.0005,
      },
      {
        name: "Standing Service",
        description: "A standing service.",
        gdpCostFraction: 0.0015,
      },
      {
        name: "Expanded Service",
        description: "An expanded service.",
        gdpCostFraction: 0.003,
      },
      {
        name: "Unrestricted Fund",
        description: "An unrestricted fund.",
        gdpCostFraction: 0.005,
      },
    ],
  },
];
