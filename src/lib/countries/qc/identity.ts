import type { CountryCommandFlavor } from "@/lib/military/theaters";
import type { ExecutiveSurfaceConfig } from "@/lib/constants/executiveSurface";
import type { IdentityText } from "@/lib/constants/institutionIdentity";
import type { NationalIdentity } from "@/lib/constants/nationalIdentity";
import type { CensusLabelSet } from "@/lib/constants/regionCensusLabels";
import type { TreasuryIdentity } from "@/lib/constants/treasuryIdentity";
import type { CountryIdentity } from "../contract";

/**
 * Quebec's names, labels and surface text as a successor country.
 *
 * Rows Scotland leaves to their readers' documented fallbacks (cabinet, stats,
 * economy text, seal, parliamentary surface, NPC bank names) are absent here
 * for the same reason: a fallback written out would look chosen.
 */

const national: NationalIdentity = {
  glyph: "QC",
  serif: "mono",
  motif: "laurel",
  name: "Quebec National Corporation",
  native: "Société nationale du Québec",
  registry: "Quebec · National Asset Register",
  ministry: "GOUVERNEMENT DU QUÉBEC",
  publicSeal: "REGISTRE PUBLIC",
  hqCity: "Quebec City",
  palette: ["#0f2a5c", "#0a1e44", "#06122a"],
  accent: "#e8eef9",
  accentSoft: "#b9c8e6",
  accentName: "Fleur-de-lis blue and white",
};

/** The authored text only. The palette is pulled from `national` downstream. */
const treasuryText: Omit<TreasuryIdentity, "palette" | "accent" | "accentSoft"> = {
  glyph: "QC",
  serif: "mono",
  budgetTitle: "Quebec Budget",
  ministry: "MINISTÈRE DES FINANCES",
  publicSeal: "DOSSIER PUBLIC",
  registry: "Quebec · Ministry of Finance",
  native: "Ministère des Finances du Québec",
};

const executiveText: IdentityText = {
  glyph: "PM",
  serif: "mono",
  registry: "Quebec · Conseil exécutif",
  title: "Office of the Premier",
};

const policyText: IdentityText = {
  glyph: "§",
  serif: "mono",
  registry: "Statute Book · Quebec",
  title: "National Policy",
};

const executiveSurface: ExecutiveSurfaceConfig = {
  clock: {
    kind: "election",
    label: "Term Clock",
    countdownNoun: "next National Assembly election",
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
  heroImage: "/api/images/hero/quebec-parliament",
  heroAlt: "Parliament Building, Quebec City",
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
  glyph: "QC",
  command: "DEFENCE STAFF",
  strip: "◆ RESTRICTED",
  acc: "#7fa6e8",
};

export const QC_IDENTITY: CountryIdentity = {
  commandFlavor,
  displayName: "Quebec",
  national,
  treasuryText,
  executiveText,
  policyText,
  executiveSurface,
  regionCensusLabels,
};
