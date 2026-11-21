import { localRoutes_L01 } from "@/lib/resetLegislation/regionalCatalog/L01";
import { localRoutes_L18 } from "@/lib/resetLegislation/regionalCatalog/L18";
import { localRoutes_L35 } from "@/lib/resetLegislation/regionalCatalog/L35";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";
/**
 * Regional choices in the 1991 reset. These are local service
 * and state-competent alternatives, not copies of a national statute. They
 * use reviewed, visibly provisional prices and outcome calibration for the
 * reset release. Future telemetry may support a later balance revision.
 */

import { regionalPresentation } from "./regionalPresentation";
import type { LegislativePosition } from "./catalog";
import type { ResetCountry } from "./fundingOwner";

export interface RegionalLawLevel {
  familyId: string;
  country: ResetCountry;
  position: LegislativePosition;
  title: string;
  description: string;
  authorityKind:
    "state_statute" | "delegated_service_package" | "provincial_or_territorial_statute";
  fundingAccount: "regional_budget";
  sourceAnchor: string;
}

const SOURCE_US = "https://www.cdc.gov/field-epi-manual/php/chapters/legal.html";
const SOURCE_UK = "https://www.legislation.gov.uk/ukpga/1990/19/contents/enacted";
const SOURCE_JP = "https://www.mhlw.go.jp/www1/english/wp_5/vol2/p2c3.html";

export interface LocalRoute {
  familyId: string;
  countries?: readonly ResetCountry[];
  levels: readonly { title: string; description: string }[];
}

/** Five locally authored service routes per family, separate from national law. */
const localRoutes: readonly LocalRoute[] = [
  ...localRoutes_L01,
  ...localRoutes_L18,
  ...localRoutes_L35,
];

const positions: readonly LegislativePosition[] = [
  "far_left",
  "center_left",
  "center",
  "center_right",
  "far_right",
];

const authoredRegionalLevels: readonly RegionalLawLevel[] = localRoutes.flatMap((route) =>
  (route.countries ?? (["US", "UK", "JP", "IE", "SCO", "WAL", "CA"] as const)).flatMap((country) =>
    route.levels.map((level, index) => ({
      familyId: route.familyId,
      country,
      position: positions[index]!,
      title: `${regionalPresentation[country].titlePrefix} ${level.title}`,
      description: `${level.description} ${regionalPresentation[country].authorityNote}`,
      authorityKind: regionalPresentation[country].authorityKind,
      fundingAccount: "regional_budget" as const,
      sourceAnchor: `${country === COUNTRY_CONFIGS.CA.id ? "2027 modeled seed" : "1991 reset crosswalk"}: ${country}:regional:${route.familyId}`,
    }))
  )
);

const localizedPublicHealthLevels: readonly RegionalLawLevel[] = (
  ["IE", "SCO", "WAL", "CA"] as const
).flatMap((country) =>
  [
    [
      "Community Health Guarantee",
      "Fund a broad local clinic, vaccination, and surveillance network with clear delivery targets.",
    ],
    [
      "Prevention Gap Fund",
      "Expand targeted community outreach and disease reporting where coverage and staffing lag.",
    ],
    [
      "Public Health Partnership",
      "Maintain core public-health services while funding audited gap-filling partnerships.",
    ],
    [
      "Targeted Prevention Plan",
      "Commission risk-targeted outreach from eligible providers and monitor delivery within national law.",
    ],
    [
      "Flexible Prevention Network",
      "Use qualified public and private local providers while preserving public reporting duties.",
    ],
  ].map(([title, description], index) => ({
    familyId: "L19",
    country,
    position: positions[index]!,
    title: `${regionalPresentation[country].titlePrefix} ${title}`,
    description: `${description} ${regionalPresentation[country].authorityNote}`,
    authorityKind: regionalPresentation[country].authorityKind,
    fundingAccount: "regional_budget" as const,
    sourceAnchor: `${country === COUNTRY_CONFIGS.CA.id ? "2027 modeled seed" : "1991 reset crosswalk"}: ${country}:regional:L19`,
  }))
);

export const regionalLawLevels: readonly RegionalLawLevel[] = [
  {
    familyId: "L19",
    country: "US",
    position: "far_left",
    title: "State Community Health Guarantee",
    description:
      "Fund a broad state clinic, vaccination, and surveillance network with local delivery targets.",
    authorityKind: "state_statute",
    fundingAccount: "regional_budget",
    sourceAnchor: SOURCE_US,
  },
  {
    familyId: "L19",
    country: "US",
    position: "center_left",
    title: "State Prevention Gap Fund",
    description:
      "Expand targeted county outreach and disease reporting where coverage and staffing lag.",
    authorityKind: "state_statute",
    fundingAccount: "regional_budget",
    sourceAnchor: SOURCE_US,
  },
  {
    familyId: "L19",
    country: "US",
    position: "center",
    title: "State Health Partnership",
    description:
      "Keep core state and county health services while funding audited gap-filling partnerships.",
    authorityKind: "state_statute",
    fundingAccount: "regional_budget",
    sourceAnchor: SOURCE_US,
  },
  {
    familyId: "L19",
    country: "US",
    position: "center_right",
    title: "Targeted State Prevention Contracts",
    description:
      "Concentrate state funds on measurable risks and contract eligible local providers.",
    authorityKind: "state_statute",
    fundingAccount: "regional_budget",
    sourceAnchor: SOURCE_US,
  },
  {
    familyId: "L19",
    country: "US",
    position: "far_right",
    title: "State Open Delivery Network",
    description:
      "Broaden qualified private delivery while retaining state reporting and emergency coordination.",
    authorityKind: "state_statute",
    fundingAccount: "regional_budget",
    sourceAnchor: SOURCE_US,
  },
  {
    familyId: "L19",
    country: "UK",
    position: "far_left",
    title: "District Prevention Service Expansion",
    description:
      "Use the regional service envelope for broad district outreach and prevention staffing under national NHS law.",
    authorityKind: "delegated_service_package",
    fundingAccount: "regional_budget",
    sourceAnchor: SOURCE_UK,
  },
  {
    familyId: "L19",
    country: "UK",
    position: "center_left",
    title: "Underserved District Outreach Plan",
    description:
      "Target regional prevention teams and clinics at documented coverage gaps within NHS authority.",
    authorityKind: "delegated_service_package",
    fundingAccount: "regional_budget",
    sourceAnchor: SOURCE_UK,
  },
  {
    familyId: "L19",
    country: "UK",
    position: "center",
    title: "Health Authority Prevention Compact",
    description:
      "Maintain core surveillance and district outreach with audited service partnerships.",
    authorityKind: "delegated_service_package",
    fundingAccount: "regional_budget",
    sourceAnchor: SOURCE_UK,
  },
  {
    familyId: "L19",
    country: "UK",
    position: "center_right",
    title: "District Risk Contract Plan",
    description:
      "Commission risk-targeted outreach from eligible providers and monitor delivery within national law.",
    authorityKind: "delegated_service_package",
    fundingAccount: "regional_budget",
    sourceAnchor: SOURCE_UK,
  },
  {
    familyId: "L19",
    country: "UK",
    position: "far_right",
    title: "Regional Provider Coordination Plan",
    description:
      "Favor flexible provider contracts while preserving statutory surveillance and emergency duties.",
    authorityKind: "delegated_service_package",
    fundingAccount: "regional_budget",
    sourceAnchor: SOURCE_UK,
  },
  {
    familyId: "L19",
    country: "JP",
    position: "far_left",
    title: "Prefectural Health-Center Expansion",
    description:
      "Coordinate broad prefectural health-center staffing and municipal prevention outreach across the aggregate.",
    authorityKind: "delegated_service_package",
    fundingAccount: "regional_budget",
    sourceAnchor: SOURCE_JP,
  },
  {
    familyId: "L19",
    country: "JP",
    position: "center_left",
    title: "Community Prevention Gap Program",
    description:
      "Fund additional prefectural and municipal outreach where documented prevention capacity is thin.",
    authorityKind: "delegated_service_package",
    fundingAccount: "regional_budget",
    sourceAnchor: SOURCE_JP,
  },
  {
    familyId: "L19",
    country: "JP",
    position: "center",
    title: "Prefectural Health Coordination",
    description:
      "Maintain health-center surveillance and municipal prevention service coordination under national law.",
    authorityKind: "delegated_service_package",
    fundingAccount: "regional_budget",
    sourceAnchor: SOURCE_JP,
  },
  {
    familyId: "L19",
    country: "JP",
    position: "center_right",
    title: "Targeted Prefectural Outreach",
    description:
      "Prioritize high-risk local outreach and accountable provider partnerships within prefectural competence.",
    authorityKind: "delegated_service_package",
    fundingAccount: "regional_budget",
    sourceAnchor: SOURCE_JP,
  },
  {
    familyId: "L19",
    country: "JP",
    position: "far_right",
    title: "Flexible Local Prevention Network",
    description:
      "Use qualified public and private local providers while preserving prefectural reporting duties.",
    authorityKind: "delegated_service_package",
    fundingAccount: "regional_budget",
    sourceAnchor: SOURCE_JP,
  },
  ...localizedPublicHealthLevels,
  ...authoredRegionalLevels,
];

export function regionalLawLevel(
  country: ResetCountry,
  familyId: string,
  position: LegislativePosition
): RegionalLawLevel | undefined {
  return regionalLawLevels.find(
    (level) =>
      level.country === country && level.familyId === familyId && level.position === position
  );
}
