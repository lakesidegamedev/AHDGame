import type { CountryCommandFlavor } from "@/lib/military/theaters";
import type { CabinetIdentity } from "@/lib/constants/cabinetIdentity";
import type { EconomyIdentity } from "@/lib/constants/economyIdentity";
import type { ExecutiveSurfaceConfig } from "@/lib/constants/executiveSurface";
import type { IdentityText } from "@/lib/constants/institutionIdentity";
import type { NationalIdentity } from "@/lib/constants/nationalIdentity";
import type { StatsIdentity } from "@/lib/constants/nationalStatsIdentity";
import type { ParliamentaryExecutiveSurface } from "@/lib/constants/parliamentaryExecutiveSurface";
import type { CensusLabelSet } from "@/lib/constants/regionCensusLabels";
import type { TreasuryIdentity } from "@/lib/constants/treasuryIdentity";
import type { CountryIdentity } from "../contract";

const cabinet: CabinetIdentity = {
  glyph: "CA",
  serif: "mono",
  gov: "#d7473f",
  govSoft: "#ee8f88",
  g0: "#2a1112",
  g1: "#1d0b0c",
  g2: "#120607",
};

const national: NationalIdentity = {
  glyph: "CN",
  serif: "mono",
  motif: "knot",
  name: "Canada National Corporation",
  native: "Société nationale du Canada",
  registry: "Canada · Federal Asset Registry",
  ministry: "FINANCE CANADA · FINANCES CANADA",
  publicSeal: "PUBLIC · PUBLIC",
  hqCity: "Ottawa",
  palette: ["#2a1112", "#1d0b0c", "#120607"],
  accent: "#d7473f",
  accentSoft: "#ee8f88",
  accentName: "Maple red",
};

const stats: StatsIdentity = {
  glyph: "SC",
  serif: "mono",
  office: "Statistique Canada",
  officeEn: "Statistics Canada",
  title: "Statistiques nationales (National Statistics)",
  titleEn: "National Statistics",
  registry: "Canada · Statistics Canada",
  seal: "STC · CA",
  accent: {
    stat: "#d7473f",
    statSoft: "#ee8f88",
    g0: "#2a1112",
    g1: "#1d0b0c",
    g2: "#120607",
  },
};

/** The authored text only. The palette is pulled from `national` downstream. */
const treasuryText: Omit<TreasuryIdentity, "palette" | "accent" | "accentSoft"> = {
  glyph: "CN",
  serif: "mono",
  budgetTitle: "Budget fédéral",
  budgetTitleEn: "Federal Budget",
  ministry: "FINANCE CANADA · FINANCES CANADA",
  publicSeal: "PUBLIC · PUBLIC",
  registry: "Canada · Department of Finance",
  native: "Canada · Ministère des Finances",
  nativeEn: "Canada · Department of Finance",
};

const economyText: Omit<EconomyIdentity, "accent"> = {
  glyph: "EC",
  serif: "mono",
  title: "Perspectives économiques",
  titleEn: "Economic Outlook",
  office: "Statistique Canada · Comptes nationaux",
  officeEn: "Statistics Canada · National Accounts",
  registry: "Canada · National Accounts Registry",
};

const executiveText: IdentityText = {
  glyph: "PM",
  serif: "mono",
  registry: "Canada · Government of Canada",
  title: "Cabinet du premier ministre",
  titleEn: "Office of the Prime Minister",
};

const policyText: IdentityText = {
  glyph: "§",
  serif: "mono",
  registry: "Code of National Law · Canada",
  title: "National Policy",
};

const executiveSurface: ExecutiveSurfaceConfig = {
  clock: {
    kind: "election",
    label: "Term Clock",
    countdownNoun: "next general election",
  },
  actLabels: {
    signed: "ENACTED",
    vetoed: "REJECTED",
    onDesk: "AWAITING",
    order: "ORDER",
    confirmed: "APPOINTED",
    nominated: "NOMINATED",
    acting: "ACTING",
  },
  deskKind: "orders",
  deskLabel: "Orders in Council",
  rosterTitle: "Cabinet",
  heroImage: "https://flagcdn.com/w640/ca.png",
  heroAlt: "Parliament Hill, Ottawa",
};

/** The PARLIAMENTARY surface. `onePartyExecutiveSurface.ts` declares a symbol of the same name that is a different thing. */
const parliamentarySurface: ParliamentaryExecutiveSurface = {
  executiveTitle: "Prime Minister",
  memberLabel: "MP",
  headPlaque: {
    title: "Prime Minister",
    sealGlyph: "PM",
    vacancyNote:
      "The leader who can command the confidence of the House of Commons forms government.",
  },
  deputyPlaque: {
    title: "Deputy Prime Minister",
    sealGlyph: "DPM",
    vacancyNote: "The Prime Minister names a Deputy Prime Minister from cabinet.",
    cabinetPositionId: "deputy_prime_minister",
  },
  oppositionPlaque: {
    title: "Leader of the Opposition",
    sealGlyph: "LO",
    vacancyNote: "The leader of the largest party not in government.",
  },
  seatsPanel: {
    title: "Commons seats by party",
    emptyText: "No MPs elected yet.",
  },
  hero: {
    image: "https://flagcdn.com/w640/ca.png",
    alt: "Parliament Hill, Ottawa",
    title: "Government of Canada",
    tagline: "Office of the Prime Minister · Cabinet and the confidence of the House",
    breadcrumbLast: "Office of the Prime Minister",
  },
};

/** Census category labels for region pages. */
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

/** Region display names (STATE_DISPLAY_NAMES), used by the commodity map. */
const stateDisplayNames: Record<string, string> = {
  CA_ON: "Ontario",
  CA_QC: "Quebec",
  CA_BC: "British Columbia",
  CA_AB: "Alberta",
  CA_MB: "Manitoba",
  CA_SK: "Saskatchewan",
  CA_NS: "Nova Scotia",
  CA_NB: "New Brunswick",
  CA_NL: "Newfoundland and Labrador",
  CA_PE: "Prince Edward Island",
  CA_YT: "Yukon",
  CA_NT: "Northwest Territories",
  CA_NU: "Nunavut",
};

/** NPC bank names, pre-modernisation. */
const historicalNames: readonly string[] = ["Dominion Provincial Bank", "Northern Trust of Canada"];

/** NPC bank names, post-modernisation. */
const modernNames: readonly string[] = ["Dominion Banking Group", "Northern Shield Financial"];

/** Situation-board dressing: high-command name, classification strip, accent. */
const commandFlavor: CountryCommandFlavor = {
  glyph: "CA",
  command: "CANADIAN ARMED FORCES HQ",
  strip: "◆ RESTRICTED",
  acc: "#e5645c",
};

export const CA_IDENTITY: CountryIdentity = {
  commandFlavor,
  displayName: "Canada",
  cabinet,
  national,
  stats,
  treasuryText,
  economyText,
  executiveText,
  policyText,
  executiveSurface,
  parliamentarySurface,
  regionCensusLabels,
  stateDisplayNames,
  historicalNames,
  modernNames,
  addressNames: { national: "Speech from the Throne", regional: "Speech from the Throne" },
};
