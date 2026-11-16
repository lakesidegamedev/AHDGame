import type { CountryCommandFlavor } from "@/lib/military/theaters";
import type { ExecutiveSurfaceConfig } from "@/lib/constants/executiveSurface";
import type { IdentityText } from "@/lib/constants/institutionIdentity";
import type { NationalIdentity } from "@/lib/constants/nationalIdentity";
import type { TreasuryIdentity } from "@/lib/constants/treasuryIdentity";
import type { CountryIdentity } from "../contract";

/**
 * California's names, labels and surface text as a successor country.
 *
 * Rows Scotland leaves to their readers' documented fallbacks (cabinet, stats,
 * economy text, seal, parliamentary surface, NPC bank names, census labels) are absent here
 * for the same reason: a fallback written out would look chosen.
 */

const national: NationalIdentity = {
  glyph: "CA",
  serif: "mono",
  motif: "laurel",
  name: "California National Corporation",
  native: "California National Corporation",
  registry: "California · National Asset Register",
  ministry: "GOVERNMENT OF TEXAS",
  publicSeal: "PUBLIC REGISTER",
  hqCity: "Sacramento",
  palette: ["#7a1f1f", "#561515", "#330c0c"],
  accent: "#f3e3a8",
  accentSoft: "#d8c585",
  accentName: "Bear Flag red and gold",
};

/** The authored text only. The palette is pulled from `national` downstream. */
const treasuryText: Omit<TreasuryIdentity, "palette" | "accent" | "accentSoft"> = {
  glyph: "CA",
  serif: "mono",
  budgetTitle: "California Budget",
  ministry: "TREASURY",
  publicSeal: "PUBLIC RECORD",
  registry: "California · Treasury",
  native: "California Treasury",
};

const executiveText: IdentityText = {
  glyph: "CM",
  serif: "mono",
  registry: "California · Executive Council",
  title: "Office of the Premier",
};

const policyText: IdentityText = {
  glyph: "§",
  serif: "mono",
  registry: "Statute Book · California",
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
  heroImage: "/api/images/hero/california-capitol",
  heroAlt: "State Capitol, Sacramento",
};

/** Situation-board dressing: high-command name, classification strip, accent. */
const commandFlavor: CountryCommandFlavor = {
  glyph: "CA",
  command: "DEFENCE STAFF",
  strip: "◆ RESTRICTED",
  acc: "#e0b94a",
};

export const RCA_IDENTITY: CountryIdentity = {
  commandFlavor,
  displayName: "California Republic",
  national,
  treasuryText,
  executiveText,
  policyText,
  executiveSurface,
};
