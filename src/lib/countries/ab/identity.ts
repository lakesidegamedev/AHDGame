import type { CountryCommandFlavor } from "@/lib/military/theaters";
import type { ExecutiveSurfaceConfig } from "@/lib/constants/executiveSurface";
import type { IdentityText } from "@/lib/constants/institutionIdentity";
import type { NationalIdentity } from "@/lib/constants/nationalIdentity";
import type { CensusLabelSet } from "@/lib/constants/regionCensusLabels";
import type { TreasuryIdentity } from "@/lib/constants/treasuryIdentity";
import type { CountryIdentity } from "../contract";

/**
 * Alberta's names, labels and surface text as a successor country.
 *
 * Rows Scotland leaves to their readers' documented fallbacks (cabinet, stats,
 * economy text, seal, parliamentary surface, NPC bank names) are absent here
 * for the same reason: a fallback written out would look chosen.
 */

const national: NationalIdentity = {
  glyph: "AB",
  serif: "mono",
  motif: "laurel",
  name: "Alberta National Corporation",
  native: "Alberta National Corporation",
  registry: "Alberta · National Asset Register",
  ministry: "GOVERNMENT OF ALBERTA",
  publicSeal: "PUBLIC REGISTER",
  hqCity: "Edmonton",
  palette: ["#0b3a6b", "#082b50", "#051a31"],
  accent: "#f3e3a8",
  accentSoft: "#d8c585",
  accentName: "Prairie blue and wheat gold",
};

/** The authored text only. The palette is pulled from `national` downstream. */
const treasuryText: Omit<TreasuryIdentity, "palette" | "accent" | "accentSoft"> = {
  glyph: "AB",
  serif: "mono",
  budgetTitle: "Alberta Budget",
  ministry: "TREASURY BOARD AND FINANCE",
  publicSeal: "PUBLIC RECORD",
  registry: "Alberta · Treasury Board and Finance",
  native: "Alberta Treasury Board and Finance",
};

const executiveText: IdentityText = {
  glyph: "PM",
  serif: "mono",
  registry: "Alberta · Executive Council",
  title: "Office of the Premier",
};

const policyText: IdentityText = {
  glyph: "§",
  serif: "mono",
  registry: "Statute Book · Alberta",
  title: "National Policy",
};

const executiveSurface: ExecutiveSurfaceConfig = {
  clock: {
    kind: "election",
    label: "Term Clock",
    countdownNoun: "next Legislative Assembly election",
  },
  actLabels: {
    signed: "ENACTED",
    vetoed: "REJECTED",
    onDesk: "AWAITING",
    order: "ORDER IN COUNCIL",
    confirmed: "APPOINTED",
    nominated: "NOMINATED",
    acting: "ACTING",
  },
  deskKind: "orders",
  deskLabel: "Orders in Force",
  rosterTitle: "Cabinet",
  heroImage: "/api/images/hero/alberta-legislature",
  heroAlt: "Legislature Building, Edmonton",
};

/** Census category labels for region pages: the same terms Canada uses. */
const regionCensusLabels: CensusLabelSet = {
  cardTitles: {
    ethnicity: "Background",
    age: "Age Distribution",
    education: "Education (Highest)",
    income: "Household Income",
    urbanization: "Urbanization",
  },
  ethnicity: {
    european_canadian: "European and other Canadian",
    south_asian: "South Asian",
    east_asian: "East Asian",
    black: "Black",
    indigenous: "Indigenous",
    other_visible_minority: "Other visible minority",
  },
  age: {
    young: "Young (18-29)",
    mid: "Mid (30-44)",
    mature: "Mature (45-64)",
    senior: "Senior (65+)",
  },
  education: {
    no_certificate: "No certificate",
    high_school: "High school",
    college_trades: "College or trades",
    university: "University degree",
  },
  income: {
    low: "Lower income",
    middle: "Middle income",
    high: "Upper income",
  },
  urbanization: {
    urban: "City / urban",
    suburban: "Suburban",
    rural: "Rural",
  },
};

/** Situation-board dressing: high-command name, classification strip, accent. */
const commandFlavor: CountryCommandFlavor = {
  glyph: "AB",
  command: "DEFENCE STAFF",
  strip: "◆ RESTRICTED",
  acc: "#e0b94a",
};

export const AB_IDENTITY: CountryIdentity = {
  commandFlavor,
  displayName: "Alberta",
  national,
  treasuryText,
  executiveText,
  policyText,
  executiveSurface,
  regionCensusLabels,
};
