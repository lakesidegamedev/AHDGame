import type { CountryCommandFlavor } from "@/lib/military/theaters";
import type { ExecutiveSurfaceConfig } from "@/lib/constants/executiveSurface";
import type { IdentityText } from "@/lib/constants/institutionIdentity";
import type { NationalIdentity } from "@/lib/constants/nationalIdentity";
import type { TreasuryIdentity } from "@/lib/constants/treasuryIdentity";
import type { CountryIdentity } from "../contract";

/**
 * New England's names, labels and surface text as a successor country.
 *
 * Rows Scotland leaves to their readers' documented fallbacks (cabinet, stats,
 * economy text, seal, parliamentary surface, NPC bank names, census labels) are absent here
 * for the same reason: a fallback written out would look chosen.
 */

const national: NationalIdentity = {
  glyph: "NE",
  serif: "mono",
  motif: "laurel",
  name: "New England National Corporation",
  native: "New England National Corporation",
  registry: "New England · National Asset Register",
  ministry: "GOVERNMENT OF NEW ENGLAND",
  publicSeal: "PUBLIC REGISTER",
  hqCity: "Boston",
  palette: ["#1f3a5f", "#15283f", "#0c1726"],
  accent: "#f3e3a8",
  accentSoft: "#d8c585",
  accentName: "Harbour blue and gold",
};

/** The authored text only. The palette is pulled from `national` downstream. */
const treasuryText: Omit<TreasuryIdentity, "palette" | "accent" | "accentSoft"> = {
  glyph: "NE",
  serif: "mono",
  budgetTitle: "New England Budget",
  ministry: "TREASURY",
  publicSeal: "PUBLIC RECORD",
  registry: "New England · Treasury",
  native: "New England Treasury",
};

const executiveText: IdentityText = {
  glyph: "PM",
  serif: "mono",
  registry: "New England · Executive Council",
  title: "Office of the Premier",
};

const policyText: IdentityText = {
  glyph: "§",
  serif: "mono",
  registry: "Statute Book · New England",
  title: "National Policy",
};

const executiveSurface: ExecutiveSurfaceConfig = {
  clock: {
    kind: "election",
    label: "Term Clock",
    countdownNoun: "next Assembly election",
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
  heroImage: "/api/images/hero/new-england-statehouse",
  heroAlt: "State House, Boston",
};

/** Situation-board dressing: high-command name, classification strip, accent. */
const commandFlavor: CountryCommandFlavor = {
  glyph: "NE",
  command: "DEFENCE STAFF",
  strip: "◆ RESTRICTED",
  acc: "#e0b94a",
};

export const NEN_IDENTITY: CountryIdentity = {
  commandFlavor,
  displayName: "New England",
  national,
  treasuryText,
  executiveText,
  policyText,
  executiveSurface,
};
