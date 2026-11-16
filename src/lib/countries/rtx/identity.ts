import type { CountryCommandFlavor } from "@/lib/military/theaters";
import type { ExecutiveSurfaceConfig } from "@/lib/constants/executiveSurface";
import type { IdentityText } from "@/lib/constants/institutionIdentity";
import type { NationalIdentity } from "@/lib/constants/nationalIdentity";
import type { TreasuryIdentity } from "@/lib/constants/treasuryIdentity";
import type { CountryIdentity } from "../contract";

/**
 * Texas's names, labels and surface text as a successor country.
 *
 * Rows Scotland leaves to their readers' documented fallbacks (cabinet, stats,
 * economy text, seal, parliamentary surface, NPC bank names, census labels) are absent here
 * for the same reason: a fallback written out would look chosen.
 */

const national: NationalIdentity = {
  glyph: "TX",
  serif: "mono",
  motif: "laurel",
  name: "Texas National Corporation",
  native: "Texas National Corporation",
  registry: "Texas · National Asset Register",
  ministry: "GOVERNMENT OF TEXAS",
  publicSeal: "PUBLIC REGISTER",
  hqCity: "Austin",
  palette: ["#002868", "#001a45", "#000f2a"],
  accent: "#f2d9d9",
  accentSoft: "#c9a4a4",
  accentName: "Lone Star blue and red",
};

/** The authored text only. The palette is pulled from `national` downstream. */
const treasuryText: Omit<TreasuryIdentity, "palette" | "accent" | "accentSoft"> = {
  glyph: "TX",
  serif: "mono",
  budgetTitle: "Texas Budget",
  ministry: "TREASURY",
  publicSeal: "PUBLIC RECORD",
  registry: "Texas · Treasury",
  native: "Texas Treasury",
};

const executiveText: IdentityText = {
  glyph: "CM",
  serif: "mono",
  registry: "Texas · Executive Council",
  title: "Office of the Chief Minister",
};

const policyText: IdentityText = {
  glyph: "§",
  serif: "mono",
  registry: "Statute Book · Texas",
  title: "National Policy",
};

const executiveSurface: ExecutiveSurfaceConfig = {
  clock: {
    kind: "election",
    label: "Term Clock",
    countdownNoun: "next House election",
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
  heroImage: "/api/images/hero/texas-capitol",
  heroAlt: "State Capitol, Austin",
};

/** Situation-board dressing: high-command name, classification strip, accent. */
const commandFlavor: CountryCommandFlavor = {
  glyph: "TX",
  command: "DEFENCE STAFF",
  strip: "◆ RESTRICTED",
  acc: "#bf0a30",
};

export const RTX_IDENTITY: CountryIdentity = {
  commandFlavor,
  displayName: "Republic of Texas",
  national,
  treasuryText,
  executiveText,
  policyText,
  executiveSurface,
};
