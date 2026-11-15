import type { Db } from "mongodb";
import { UK_REGION_POLLING_2020 } from "@/lib/countries/uk/data/ukRegionPolling2020";
import { UK_REGION_POLLING_2024 } from "@/lib/countries/uk/data/ukRegionPolling2024";
import { UK_REGION_POLLING_1992 } from "@/lib/countries/uk/data/ukRegionPolling1992";
import { UK_REGION_POLLING_1951 } from "@/lib/countries/uk/data/ukRegionPolling1951";
import type { StatePartyOrg, PoliticalParty } from "@/lib/db/types";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { organizationFromVoteShare } from "@/lib/parties/rules/voteShareOrganization";

/**
 * Calculate UK state party organization levels from era polling data
 * (1951 / 1992 / 2020 general-election tables, selected by preset).
 *
 * Unlike the US two-party system which uses political lean (-5 to +5),
 * the UK multi-party system uses absolute vote share percentages.
 *
 * Organizations scale from vote share:
 * - 0% vote → 5 org (minimal presence)
 * - 50% vote → 70 org (dominant party)
 */

/**
 * UK party slug to display name, resolved to politicalParties.name for
 * runtime sequentialId lookup. Slugs match the ids in ukRegionPolling2020.ts
 * and getMajorPartiesForRegion.
 */
const UK_PARTY_SLUG_TO_NAME: Record<string, string> = {
  uk_labour: "Labour Party",
  uk_conservative: "Conservative Party",
  uk_libdem: "Liberal Democrats",
  uk_liberal: "Liberal Party", // historic Liberals — 1953-only default seed
  uk_snp: "Scottish National Party",
  uk_plaid: "Plaid Cymru",
  uk_green: "Green Party",
  uk_reform: "Reform UK",
  uk_dup: "Democratic Unionist Party",
  uk_sf: "Sinn Féin",
  uk_uup: "Ulster Unionist Party",
};

/**
 * Build a runtime slug → sequentialId map by reading politicalParties from
 * the DB. Resolves to whatever sequentialId each party actually has rather
 * than assuming insertion order — robust to preset filtering and
 * insert/delete cycles (e.g. UUP/Reform UK being added or removed across
 * preset switches).
 */
export async function buildUKPartySlugToSeqId(db: Db): Promise<Record<string, string>> {
  const parties = await politicalPartiesCollection(db)
    .find({ countryId: "UK" })
    .project<{ name: string; sequentialId: number }>({ name: 1, sequentialId: 1 })
    .toArray();

  const byName = new Map(parties.map((p) => [p.name, String(p.sequentialId)]));
  const out: Record<string, string> = {};
  for (const [slug, name] of Object.entries(UK_PARTY_SLUG_TO_NAME)) {
    const seqId = byName.get(name);
    if (seqId) out[slug] = seqId;
  }
  return out;
}

/**
 * Generate UK state party org entries for each region x party present in the
 * polling data and in the DB. Resolves slug -> sequentialId from the live
 * politicalParties collection; parties gated out by validForPresets for the
 * active preset are skipped.
 *
 * Preset to polling table:
 *   1953-default: UK_REGION_POLLING_1951
 *   1979-default, 1991-default: UK_REGION_POLLING_1992
 *   2027-default: UK_REGION_POLLING_2024
 *   anything else (incl. 2019-default): UK_REGION_POLLING_2020
 */
export async function calculateUKStatePartyOrgs(
  db: Db,
  preset: string
): Promise<Omit<StatePartyOrg, "createdAt" | "updatedAt">[]> {
  const orgs: Omit<StatePartyOrg, "createdAt" | "updatedAt">[] = [];
  const slugToSeqId = await buildUKPartySlugToSeqId(db);
  const polling =
    preset === "1953-default"
      ? UK_REGION_POLLING_1951
      : preset === "1991-default" || preset === "1979-default"
        ? UK_REGION_POLLING_1992
        : preset === "2027-default"
          ? UK_REGION_POLLING_2024
          : UK_REGION_POLLING_2020;

  for (const [regionId, partyVotes] of Object.entries(polling)) {
    for (const [partySlug, voteShare] of Object.entries(partyVotes)) {
      const partySeqId = slugToSeqId[partySlug];
      if (!partySeqId) continue; // party not in DB (e.g. UUP under 2019 preset)
      // Every party in the polling table gets a row in every region. The
      // formerly-regional parties (SNP/Plaid/DUP/SF/UUP) poll 0 outside their
      // historic home nation, so they land on the organization floor with a 0
      // registration share — present and organisable, but starting from
      // nothing rather than barred outright.
      const org = organizationFromVoteShare(voteShare);

      orgs.push({
        _id: `${regionId}_${partySeqId}`,
        countryId: "UK",
        stateId: regionId,
        partyId: partySeqId,
        organization: org,
        // Era polling share seeds both registration fields:
        //  - `registration` feeds the existing Reg lanes (regResistance +
        //    transferable/peel curves) exactly like the US lane values do.
        //    For the 2019 preset the curated UK lanes in registrationLanes.ts
        //    overwrite this afterwards; for era presets without UK lanes
        //    (1953/1979/1991) the polling share IS the registration seed.
        //  - `registrationShare` preserves the original era share for seed
        //    provenance and aggregation/backfill paths. Ongoing elections use
        //    the live `registration` value above.
        registration: voteShare,
        registrationShare: voteShare,
        chairId: null,
        viceChairId: null,
        treasurerId: null,
        treasury: 0,
        stateTaxRate: 5,
        politicalStrength: 0,
        hasPresence: true, // Major UK parties have presence in all regions
        consecutiveLosses: 0,
      });
    }
  }

  return orgs;
}

export default calculateUKStatePartyOrgs;
