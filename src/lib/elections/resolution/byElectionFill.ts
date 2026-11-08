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
import type { Election, ElectionCandidate, NPP } from "@/lib/db/types";
import { getAllCountryAccess } from "@/lib/countryAccess";
import { getElectionsCollection } from "@/lib/db/collections/elections";
import { getElectedOfficialsCollection } from "@/lib/db/collections/electedOfficials";
import { getNppsCollection } from "@/lib/db/collections/npps";
import { getPoliticalPartiesCollection } from "@/lib/db/collections/politicalParties";
import { getUkCommonsVacanciesCollection } from "@/lib/db/collections/ukByElection";
import { DEFAULT_CANDIDATE_SUPPORT } from "@/lib/electionEngine/electionFormulaFactors";
import { isActiveElectionCandidateDuplicateKey } from "@/lib/elections/duplicateKey";
import {
  BY_ELECTION_FILL_LEAD_TURNS,
  needsFillCandidate,
  pickFillParty,
} from "@/lib/elections/rules/byElectionFill";
import { openNppCreationBatch } from "@/lib/npp/generator";
import { buildNppElectionEligiblePartyKeys } from "@/lib/parties/antiAbuseGuards";
import { getChallengerSupplyPolicy } from "@/lib/turn/npp/rules/challengerSupply";
import { processByElectionWatcher } from "@/lib/turn/byElections";

const SPECIAL_COMMONS = "special_commons";
const SPECIAL_GOVERNOR = "special_governor";

/** Previous party per race: Commons from the claimed vacancies, governors from the vacated row. */
async function loadPreviousParties(db: Db, races: Election[]): Promise<Map<string, string>> {
  const previous = new Map<string, string>();
  const vacancyIds = races.flatMap((r) =>
    r.electionType === SPECIAL_COMMONS ? (r.byElectionVacancyIds ?? []) : []
  );
  if (vacancyIds.length > 0) {
    const vacancies = await getUkCommonsVacanciesCollection(db)
      .find({ _id: { $in: vacancyIds }, priorParty: { $exists: true } })
      .toArray();
    for (const race of races) {
      const hit = vacancies.find((v) =>
        (race.byElectionVacancyIds ?? []).some((id) => id.equals(v._id))
      );
      if (hit?.priorParty) previous.set(String(race._id), hit.priorParty);
    }
  }
  const governorRaces = races.filter((r) => r.electionType === SPECIAL_GOVERNOR);
  if (governorRaces.length > 0) {
    const rows = await (
      await getElectedOfficialsCollection(db)
    )
      .find(
        { officeType: "governor", state: { $in: governorRaces.map((r) => r.state) } },
        { projection: { state: 1, countryId: 1, party: 1 } }
      )
      .toArray();
    for (const race of governorRaces) {
      const row = rows.find(
        (o) => o.state === race.state && (o.countryId ?? "US") === (race.countryId ?? "US")
      );
      if (typeof row?.party === "string" && row.party) previous.set(String(race._id), row.party);
    }
  }
  return previous;
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
  const activeCandidates = await candidateCol
    .find({ status: "active" }, { projection: { electionId: 1, nppId: 1 } })
    .toArray();
  const contested = new Set(activeCandidates.map((c) => String(c.electionId)));
  const empty = closing.filter((e) =>
    needsFillCandidate({
      activeCandidateCount: contested.has(String(e._id)) ? 1 : 0,
      primaryEndTurn: e.primaryEndTurn as number,
      currentTurn,
    })
  );
  if (empty.length === 0) return 0;

  const access = await getAllCountryAccess(db);
  const countries = [...new Set(empty.map((e) => (e.countryId ?? "US") as CountryId))];
  const partyDocs = await (
    await getPoliticalPartiesCollection(db)
  )
    .find(
      { countryId: { $in: countries }, defunct: { $ne: true }, regimeStatus: { $ne: "banned" } },
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
  const previousParties = await loadPreviousParties(db, empty);

  const partyByRace = new Map<string, { countryId: CountryId; party: string }>();
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
    const party = pickFillParty(previousParties.get(String(race._id)), eligible);
    if (party) partyByRace.set(String(race._id), { countryId, party });
  }
  if (partyByRace.size === 0) return 0;

  const busy = new Set(activeCandidates.map((c) => String(c.nppId)));
  const seated = new Set(
    (
      await (
        await getElectedOfficialsCollection(db)
      )
        .find({ nppId: { $exists: true, $ne: null } }, { projection: { nppId: 1 } })
        .toArray()
    ).map((o) => String(o.nppId))
  );
  const wanted = [...partyByRace.values()];
  const pool = (
    await (
      await getNppsCollection(db)
    )
      .find(
        {
          countryId: { $in: [...new Set(wanted.map((w) => w.countryId))] },
          party: { $in: [...new Set(wanted.map((w) => w.party))] },
          retiredAt: null,
          isTechnocrat: { $ne: true },
        },
        { projection: { _id: 1, name: 1, party: 1, countryId: 1, homeState: 1 } }
      )
      .toArray()
  ).filter((n) => !busy.has(String(n._id)) && !seated.has(String(n._id)));

  const nppBatch = openNppCreationBatch(db, new Map());
  const docs: ElectionCandidate[] = [];
  try {
    for (const race of empty) {
      const pick = partyByRace.get(String(race._id));
      if (!pick) continue;
      const matches = pool.filter((n) => n.party === pick.party && n.countryId === pick.countryId);
      const reused = matches.find((n) => n.homeState === race.state) ?? matches[0];
      if (reused) pool.splice(pool.indexOf(reused), 1);
      const npp: NPP =
        reused ??
        (await nppBatch.create({
          state: race.state,
          party: pick.party,
          countryId: pick.countryId,
          quality: 0,
        }));
      docs.push({
        electionId: race._id,
        countryId: pick.countryId,
        characterId: npp._id,
        characterName: npp.name,
        party: npp.party,
        status: "active",
        support: DEFAULT_CANDIDATE_SUPPORT,
        enteredAt: now,
        isNPP: true,
        nppId: npp._id,
      } as ElectionCandidate);
    }
  } finally {
    await nppBatch.close();
  }
  if (docs.length === 0) return 0;
  try {
    await candidateCol.insertMany(docs, { ordered: false });
  } catch (error) {
    if (!isActiveElectionCandidateDuplicateKey(error)) throw error;
  }
  console.log(`[Turn] Filed ${docs.length} fallback by-election candidate(s)`);
  return docs.length;
}

/** Governor by-election watcher followed by the fill guarantee for every live by-election. */
export async function processByElectionsWithFill(
  db: Db,
  currentTurn: number,
  now: Date
): Promise<{ spawned: number }> {
  const result = await processByElectionWatcher(db, currentTurn, now);
  await fillUncontestedByElections(db, currentTurn, now);
  return result;
}
