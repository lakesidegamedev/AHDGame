import type { Db, ObjectId } from "mongodb";
import { isCampaignEligibleElection } from "@/lib/campaigns/isCampaignEligible";
import type { Campaign, Election } from "@/lib/db/types";
import type { Migration, MigrationResult } from "../types";

/**
 * Archive the campaigns left in races Campaign Manager no longer covers.
 *
 * Campaign Manager is the presidential campaign system. Phase 5.5 and #3653
 * had opened it to US senate / governor / house / state senate, UK commons and
 * JP races; those campaigns now stop earning, paying upkeep and appearing on
 * campaign surfaces. Archiving (never deleting) keeps their funds, upgrades and
 * history on the document, the same way a withdrawn candidate's campaign is
 * kept. Their field offices are swept by the next upkeep pass.
 *
 * Idempotent: only non-archived campaigns are considered, so a rerun finds
 * nothing left to archive.
 */
export const migration: Migration = {
  id: "2026-11-01-archive-non-presidential-campaigns",
  description: "Archive campaigns in races Campaign Manager no longer covers (non-presidential)",
  idempotent: true,
  async execute(db: Db, ctx): Promise<MigrationResult> {
    const campaigns = await db
      .collection<Campaign>("campaigns")
      .find({ status: { $ne: "archived" } }, { projection: { _id: 1, electionId: 1, funds: 1 } })
      .toArray();
    if (campaigns.length === 0) {
      return { documentsScanned: 0, documentsUpdated: 0, notes: ["no live campaigns"] };
    }

    const electionIds = [
      ...new Map(campaigns.map((c) => [c.electionId.toString(), c.electionId])).values(),
    ];
    const elections = await db
      .collection<Election>("elections")
      .find(
        { _id: { $in: electionIds } },
        { projection: { _id: 1, countryId: 1, electionType: 1, russianPresidentialRound: 1 } }
      )
      .toArray();
    const electionById = new Map(elections.map((e) => [e._id.toString(), e]));

    const targets: ObjectId[] = [];
    const byRace = new Map<string, { n: number; funds: number }>();
    for (const campaign of campaigns) {
      const election = electionById.get(campaign.electionId.toString());
      // A campaign whose election is gone is left for the resolution sweep.
      if (!election || isCampaignEligibleElection(election)) continue;
      targets.push(campaign._id);
      const key = `${election.countryId ?? "??"}/${election.electionType ?? "??"}`;
      const row = byRace.get(key) ?? { n: 0, funds: 0 };
      row.n += 1;
      row.funds += Number.isFinite(campaign.funds) ? campaign.funds : 0;
      byRace.set(key, row);
    }

    const notes = [...byRace.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([race, row]) =>
          `${ctx.dryRun ? "would archive" : "archived"} ${row.n} ${race} campaign(s), ${Math.round(row.funds)} local funds left on them`
      );
    if (targets.length === 0 || ctx.dryRun) {
      return { documentsScanned: campaigns.length, documentsUpdated: 0, notes };
    }

    const res = await db
      .collection<Campaign>("campaigns")
      .updateMany(
        { _id: { $in: targets }, status: { $ne: "archived" } },
        { $set: { status: "archived", archivedAt: new Date(), archivedReason: "ineligible" } }
      );
    return { documentsScanned: campaigns.length, documentsUpdated: res.modifiedCount, notes };
  },
};
