import type { PartySeed } from "@/lib/seeds/reference/politicalParties";

/**
 * Nigeria default political parties, keyed by preset.
 * Preset rosters (see seedOrder):
 * - 1953-default: NCNC / AG / NPC (three major regional parties of late
 * colonial Nigeria).
 * - 1979-default: NPN / UPN / NPP / GNPP / PRP (five parties of the Second
 * Republic's 1979 election).
 * - 1991-default: SDP / NRC (the two state-created Third Republic parties).
 * - 2019-default: APC / PDP / LP / NNPP / APGA (modern post-2019 landscape).
 *
 * Seeded as isDefault: true (always exist, cannot be deleted). seedOrder
 * determines sequentialId assignment within NG.
 */
export const ngParties: PartySeed[] = [
  {
    seedOrder: 1,
    countryId: "NG",
    name: "All Progressives Congress",
    abbreviation: "APC",
    color: "#1B4F8C",
    economicPosition: 2, // center-right, market-friendly, deregulation lean
    socialPosition: 3, // socially conservative
    memberCount: 0,
    isDefault: true,
    treasury: 0,
    nationalTaxRate: 0,
    politicalStrength: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    createdBy: null,
    validForPresets: ["2019-default", "2027-default"],
  },
  {
    seedOrder: 2,
    countryId: "NG",
    name: "Peoples Democratic Party",
    abbreviation: "PDP",
    color: "#0A7A35",
    economicPosition: 0, // centrist, mixed-economy catch-all
    socialPosition: -1, // mildly progressive
    memberCount: 0,
    isDefault: true,
    treasury: 0,
    nationalTaxRate: 0,
    politicalStrength: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    createdBy: null,
    validForPresets: ["2019-default", "2027-default"],
  },
  {
    seedOrder: 3,
    countryId: "NG",
    name: "Labour Party",
    abbreviation: "LP",
    color: "#E8A014",
    economicPosition: -3, // center-left populist, redistribution focus
    socialPosition: -2, // socially progressive
    memberCount: 0,
    isDefault: true,
    treasury: 0,
    nationalTaxRate: 0,
    politicalStrength: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    createdBy: null,
    validForPresets: ["2019-default", "2027-default"],
  },
  {
    seedOrder: 4,
    countryId: "NG",
    name: "New Nigeria Peoples Party",
    abbreviation: "NNPP",
    color: "#8B0000",
    economicPosition: -1, // centrist with welfare tilt
    socialPosition: -1, // mildly progressive
    memberCount: 0,
    isDefault: true,
    treasury: 0,
    nationalTaxRate: 0,
    politicalStrength: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    createdBy: null,
    validForPresets: ["2019-default", "2027-default"],
  },
  {
    seedOrder: 5,
    countryId: "NG",
    name: "All Progressives Grand Alliance",
    abbreviation: "APGA",
    color: "#7B3F99",
    economicPosition: 1, // center-right regional, business-friendly
    socialPosition: 1, // moderately conservative
    memberCount: 0,
    isDefault: true,
    treasury: 0,
    nationalTaxRate: 0,
    politicalStrength: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    createdBy: null,
    validForPresets: ["2019-default", "2027-default"],
  },
  {
    seedOrder: 6,
    countryId: "NG",
    name: "Social Democratic Party",
    abbreviation: "SDP",
    color: "#D4A017",
    economicPosition: -1, // center-left, welfare-oriented
    socialPosition: -1, // mildly progressive, pluralist
    memberCount: 0,
    isDefault: true,
    treasury: 0,
    nationalTaxRate: 0,
    politicalStrength: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    createdBy: null,
    validForPresets: ["1991-default"],
  },
  {
    seedOrder: 7,
    countryId: "NG",
    name: "National Republican Convention",
    abbreviation: "NRC",
    color: "#2E8B57",
    economicPosition: 2, // center-right, market-friendly
    socialPosition: 2, // socially conservative, traditionalist
    memberCount: 0,
    isDefault: true,
    treasury: 0,
    nationalTaxRate: 0,
    politicalStrength: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    createdBy: null,
    validForPresets: ["1991-default"],
  },
  // ─── 1953 late-colonial regional triad ─────────────────────────────────
  {
    // Founded 1944 as NCNC; "and the Cameroons" still in the name in 1953
    // (Southern Cameroons left the federation only in 1961; renamed National
    // Council of Nigerian Citizens in 1962). Azikiwe's Igbo/Eastern machine.
    seedOrder: 8,
    countryId: "NG",
    name: "National Council of Nigeria and the Cameroons",
    abbreviation: "NCNC",
    color: "#006B3F",
    economicPosition: -1, // nationalist developmentalism, anti-colonial welfare lean
    socialPosition: -1, // relatively progressive / urban for the era
    memberCount: 0,
    isDefault: true,
    treasury: 0,
    nationalTaxRate: 0,
    politicalStrength: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    createdBy: null,
    validForPresets: ["1953-default"],
  },
  {
    // Founded March 1951 out of the Egbe Omo Oduduwa; Awolowo's Yoruba/Western
    // vehicle. Favoured free enterprise + ambitious regional welfare (free
    // primary education in the West from 1955).
    seedOrder: 9,
    countryId: "NG",
    name: "Action Group",
    abbreviation: "AG",
    color: "#E85D04",
    economicPosition: 1, // free-enterprise + regional welfarism
    socialPosition: 0,
    memberCount: 0,
    isDefault: true,
    treasury: 0,
    nationalTaxRate: 0,
    politicalStrength: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    createdBy: null,
    validForPresets: ["1953-default"],
  },
  {
    // Founded 1951 from the Jam'iyyar Mutanen Arewa cultural association;
    // Ahmadu Bello (Sardauna of Sokoto) as leader, Tafawa Balewa as federal
    // face. Dominated the Northern Region and (via demography) federal politics.
    seedOrder: 10,
    countryId: "NG",
    name: "Northern People's Congress",
    abbreviation: "NPC",
    color: "#1B4F3C",
    economicPosition: 1, // conservative gradualist; northern interest protection
    socialPosition: 3, // traditionalist, emirate-aligned
    memberCount: 0,
    isDefault: true,
    treasury: 0,
    nationalTaxRate: 0,
    politicalStrength: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    createdBy: null,
    validForPresets: ["1953-default"],
  },
  // ─── 1979 Second Republic launch ───────────────────────────────────────
  {
    // Shagari's centrist federal big tent; won the 1979 presidential and
    // National Assembly elections. Strongest in the North but built as a
    // genuinely national coalition to satisfy the 1979 constitution's
    // federal-character spread requirement.
    seedOrder: 11,
    countryId: "NG",
    name: "National Party of Nigeria",
    abbreviation: "NPN",
    color: "#1B4F3C",
    economicPosition: 1, // gradualist state-capitalist, oil-revenue patronage
    socialPosition: 1,
    memberCount: 0,
    isDefault: true,
    treasury: 0,
    nationalTaxRate: 0,
    politicalStrength: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    createdBy: null,
    validForPresets: ["1979-default"],
  },
  {
    // Awolowo's Action Group successor; Yoruba/South-West base, ran on free
    // universal primary education and welfarism in the Western tradition.
    seedOrder: 12,
    countryId: "NG",
    name: "Unity Party of Nigeria",
    abbreviation: "UPN",
    color: "#E85D04",
    economicPosition: -1, // welfare-statist, free education/health programme
    socialPosition: -1,
    memberCount: 0,
    isDefault: true,
    treasury: 0,
    nationalTaxRate: 0,
    politicalStrength: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    createdBy: null,
    validForPresets: ["1979-default"],
  },
  {
    // Azikiwe's NCNC successor; Igbo/Eastern base carried into the Second
    // Republic.
    seedOrder: 13,
    countryId: "NG",
    name: "Nigerian Peoples Party",
    abbreviation: "NPP",
    color: "#006B3F",
    economicPosition: -1,
    socialPosition: -1,
    memberCount: 0,
    isDefault: true,
    treasury: 0,
    nationalTaxRate: 0,
    politicalStrength: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    createdBy: null,
    validForPresets: ["1979-default"],
  },
  {
    // Ibrahim Waziri's breakaway from the NPN; North-East regional base.
    seedOrder: 14,
    countryId: "NG",
    name: "Great Nigeria Peoples Party",
    abbreviation: "GNPP",
    color: "#8B0000",
    economicPosition: 1,
    socialPosition: 2, // conservative, traditionalist Northern base
    memberCount: 0,
    isDefault: true,
    treasury: 0,
    nationalTaxRate: 0,
    politicalStrength: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    createdBy: null,
    validForPresets: ["1979-default"],
  },
  {
    // Aminu Kano's radical-populist vehicle; Kano/Northern-urban and
    // talakawa (commoner) base, the era's clearest left-populist voice.
    seedOrder: 15,
    countryId: "NG",
    name: "Peoples Redemption Party",
    abbreviation: "PRP",
    color: "#C62828",
    economicPosition: -3, // radical redistributive populism
    socialPosition: -2,
    memberCount: 0,
    isDefault: true,
    treasury: 0,
    nationalTaxRate: 0,
    politicalStrength: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    createdBy: null,
    validForPresets: ["1979-default"],
  },
];
