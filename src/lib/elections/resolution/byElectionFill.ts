/**
 * Fill guarantee for uncontested by-elections (Commons and governors).
 *
 * Just before a by-election's filing window closes with no candidate, an NPP of
 * the seat's previous party is entered, so the seat is not left empty through
 * another retry cooldown. A free NPP is reused when one exists, otherwise one is
 * generated; races that already have a candidate are never touched.
 */

import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { Election, ElectionCandidate, NPP, PoliticalParty } from "@/lib/db/types";
import { getAllCountryAccess } from "@/lib/countryAccess";
import { getElectionsCollection } from "@/lib/db/collections/elections";
import { getElectedOfficialsCollection } from "@/lib/db/collections/electedOfficials";
import { getNppsCollection } from "@/lib/db/collections/npps";
import { getUkCommonsVacanciesCollection } from "@/lib/db/collections/ukByElection";
import { officialsCountryScope } from "@/lib/db/electedOfficialScope";
import { DEFAULT_CANDIDATE_SUPPORT } from "@/lib/electionEngine/electionFormulaFactors";
import { isActiveElectionCandidateDuplicateKey } from "@/lib/elections/duplicateKey";
import {
  BY_ELECTION_FILL_LEAD_TURNS,
  needsFillCandidate,
  pickFillParty,
} from "@/lib/elections/rules/byElectionFill";
import { openNppCreationBatch } from "@/lib/npp/generator";
import { buildNppElectionEligiblePartyKeys } from "@/lib/parties/antiAbuseGuards";
import { getChallengerSupplyPolicy } from "@/lib/turn/rules/challengerSupply";

const SPECIAL_COMMONS = "special_commons";
const SPECIAL_GOVERNOR = "special_governor";

async function previousPartyOf(db: Db, race: Election): Promise<string | null> {
  if (race.electionType === SPECIAL_COMMONS) {
    const ids = race.byElectionVacancyIds ?? [];
    if (ids.length === 0) return null;
    const vacancy = await getUkCommonsVacanciesCollection(db).findOne({
      _id: { $in: ids },
      priorParty: { $exists: true },
    });
    return vacancy?.priorParty ?? null;
  }
  const row = await (
    await getElectedOfficialsCollection(db)
  ).findOne({
    officeType: "governor",
    state: race.state,
    ...officialsCountryScope((race.countryId ?? "US") as CountryId),
  });
  return typeof row?.party === "string" && row.party ? row.party : null;
}

/** Enter a fallback candidate into each by-election about to close its filing window empty. */
export async function fillUncontestedByElections(
  db: Db,
  currentTurn: number,
  now: Date
): Promise<number> {
  const elections = await getElectionsCollection(db);
  const closing = await elections
    .find({
      electionType: { $in: [SPECIAL_COMMONS, SPECIAL_GOVERNOR] },
      status: "active",
      primaryEndTurn: { $gt: currentTurn, $lte: currentTurn + BY_ELECTION_FILL_LEAD_TURNS },
    })
    .toArray();
  if (closing.length === 0) return 0;

  const candidateCol = db.collection<ElectionCandidate>("electionCandidates");
  const contested = new Set(
    (
      await candidateCol
        .find(
          { electionId: { $in: closing.map((e) => e._id) }, status: "active" },
          { projection: { electionId: 1 } }
        )
        .toArray()
    ).map((c) => String(c.electionId))
  );
  const empty = closing.filter((e) =>
    needsFillCandidate({
      activeCandidateCount: contested.has(String(e._id)) ? 1 : 0,
      primaryEndTurn: e.primaryEndTurn as number,
      currentTurn,
    })
  );
  if (empty.length === 0) return 0;

  const access = await getAllCountryAccess(db);
  const partyDocs = await db
    .collection<PoliticalParty>("politicalParties")
    .find(
      { defunct: { $ne: true }, regimeStatus: { $ne: "banned" } },
      {
        projection: {
          sequentialId: 1,
          countryId: 1,
          isDefault: 1,
          tier: 1,
          createdTurn: 1,
          nppElectionMatureAtTurn: 1,
          createdAt: 1,
        },
      }
    )
    .toArray();
  const eligibleKeys = buildNppElectionEligiblePartyKeys(partyDocs, now, currentTurn);
  const nppCol = await getNppsCollection(db);
  const nppBatch = openNppCreationBatch(db, new Map());
  let filed = 0;
  try {
    for (const race of empty) {
      const countryId = (race.countryId ?? "US") as CountryId;
      if (!getChallengerSupplyPolicy(access[countryId], race.electionType).canReuse) continue;
      const eligible = partyDocs
        .filter((p) => String(p.countryId ?? "US") === countryId)
        .filter((p) => eligibleKeys.has(`${countryId}:${p.sequentialId}`))
        .sort(
          (a, b) => Number(!!b.isDefault) - Number(!!a.isDefault) || a.sequentialId - b.sequentialId
        )
        .map((p) => String(p.sequentialId));
      const party = pickFillParty(await previousPartyOf(db, race), eligible);
      if (!party) continue;

      const busy = new Set(
        (
          await candidateCol
            .find({ status: "active", party }, { projection: { nppId: 1 } })
            .toArray()
        ).map((c) => String(c.nppId))
      );
      const seated = new Set(
        (
          await (
            await getElectedOfficialsCollection(db)
          )
            .find({ nppId: { $exists: true, $ne: null } }, { projection: { nppId: 1 } })
            .toArray()
        ).map((o) => String(o.nppId))
      );
      const pool = await nppCol
        .find(
          { countryId, party, retiredAt: null, isTechnocrat: { $ne: true } },
          { projection: { _id: 1, name: 1, party: 1, countryId: 1, homeState: 1 } }
        )
        .toArray();
      const free = pool.filter((n) => !busy.has(String(n._id)) && !seated.has(String(n._id)));
      const npp: NPP =
        free.find((n) => n.homeState === race.state) ??
        free[0] ??
        (await nppBatch.create({ state: race.state, party, countryId, quality: 0 }));

      try {
        await candidateCol.insertOne({
          electionId: race._id,
          countryId,
          characterId: npp._id,
          characterName: npp.name,
          party: npp.party,
          status: "active",
          support: DEFAULT_CANDIDATE_SUPPORT,
          enteredAt: now,
          isNPP: true,
          nppId: npp._id,
        } as ElectionCandidate);
        filed++;
      } catch (error) {
        if (!isActiveElectionCandidateDuplicateKey(error)) throw error;
      }
    }
  } finally {
    await nppBatch.close();
  }
  if (filed > 0) console.log(`[Turn] Filed ${filed} fallback by-election candidate(s)`);
  return filed;
}
