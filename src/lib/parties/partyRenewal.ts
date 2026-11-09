/**
 * Party renewal turn shell. Rules live in `./rules/partyRenewal`.
 *
 * Every few turns, per NPP-run multi-party country, find a fully resolved
 * lower-chamber general election cycle since the last look. Snapshot vote shares,
 * seat shares, governing party and approval, and empty ideological spans; when a
 * previous snapshot exists, ask the rules what renewal the two elections justify
 * and carry it out. Folds reuse the party merger, so seats, offices, candidacies
 * and coalition slots move with the folded party's NPPs.
 *
 * Gated by `gameState.nppPartyRenewalEnabled`. Absent or false: nothing is read
 * past the flag and nothing is written.
 */
import { ObjectId, type AnyBulkWriteOperation, type Db } from "mongodb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { loadCountryTiers } from "@/lib/country/countryTier";
import type {
  Election,
  ElectedOfficial,
  ElectionVoteTally,
  GameState,
  GovernmentFormation,
  NPP,
  PoliticalParty,
} from "@/lib/db/types";
import type { GovernmentApproval } from "@/lib/db/types/governmentApproval";
import type { StatePartyOrg } from "@/lib/db/types/statePartyOrg";
import type { PartyRenewalEvent, PartyRenewalState } from "@/lib/db/types/partyRenewal";
import { getNextSequentialId } from "@/lib/db/sequentialId";
import { getPartyRenewalStatesCollection } from "@/lib/db/collections/partyRenewalStates";
import { makeSeededRng } from "@/lib/events/substrate/rng";
import {
  getChamberKeyForOfficeType,
  getLowerChamberOfficeType,
} from "@/lib/legislature/chamberOfficeType";
import { officeKeyForElectionType } from "@/lib/utils/electionLabels";
import { createNPP, type NPPGenerationContext } from "@/lib/npp/generator";
import { ORG_BUILD_UNITS_PER_CLICK } from "@/lib/constants/partyOrg";
import { createSystemNewsPost } from "@/lib/news";
import { loadLegacyApprovalPoints } from "@/lib/government/leaderLegacy";
import { legacyAdjustedApproval } from "@/lib/government/rules/leaderLegacy";
import { mergePartyInto } from "./proposals";
import {
  FOUNDING_BENCH_SIZE,
  chamberSeatShares,
  electorateCentre,
  ideologyAnchors,
  ideologyGaps,
  nationalVoteShares,
  planPartyRenewal,
  recordHeldRegions,
  renewalNewsPost,
  type RenewalNewsEvent,
  type FoundingPlan,
  type RenewalCycleSnapshot,
  type RenewalNpp,
  type RenewalParty,
  type SplinterPlan,
} from "./rules/partyRenewal";

/** Renewal looks for newly resolved cycles this often. */
export const PARTY_RENEWAL_CHECK_INTERVAL_TURNS = 6;
const MAX_EVENTS = 20;
/** A splinter organises in at most this many of its faction's home regions. */
const MAX_SPLINTER_BASE_REGIONS = 3;

export interface PartyRenewalSummary {
  countries: number;
  splinters: number;
  foundings: number;
  folds: number;
}

type PartyRow = Pick<
  PoliticalParty,
  | "_id"
  | "sequentialId"
  | "countryId"
  | "name"
  | "abbreviation"
  | "color"
  | "economicPosition"
  | "socialPosition"
  | "createdBy"
  | "chairId"
  | "viceChairId"
  | "treasurerId"
  | "nationalTaxRate"
>;

/** Election types that fill the lower chamber, including snap elections. */
function lowerChamberTypes(countryId: CountryId, preset: string | undefined) {
  const office = getLowerChamberOfficeType(countryId, preset);
  const chamberKey = getChamberKeyForOfficeType(countryId, office, preset);
  return {
    office,
    types: [...new Set([office, chamberKey, `snap_${office}`, `snap_${chamberKey}`])],
  };
}

/** Latest cycle above `after` whose lower-chamber races have all resolved. */
export function latestCompleteCycle(
  elections: readonly Pick<Election, "cycle" | "status">[],
  after: number
): number | null {
  const byCycle = new Map<number, boolean>();
  for (const e of elections) {
    if (e.cycle <= after) continue;
    byCycle.set(e.cycle, (byCycle.get(e.cycle) ?? true) && e.status === "resolved");
  }
  const complete = [...byCycle].filter(([, done]) => done).map(([cycle]) => cycle);
  return complete.length > 0 ? Math.max(...complete) : null;
}

export async function processPartyRenewal(
  db: Db,
  currentTurn: number
): Promise<PartyRenewalSummary> {
  const summary: PartyRenewalSummary = { countries: 0, splinters: 0, foundings: 0, folds: 0 };
  if (currentTurn % PARTY_RENEWAL_CHECK_INTERVAL_TURNS !== 0) return summary;
  const game = await db
    .collection<GameState>("gameState")
    .findOne(
      { _id: "current" },
      { projection: { nppPartyRenewalEnabled: 1, preset: 1, resetWorldId: 1 } }
    );
  if (game?.nppPartyRenewalEnabled !== true) return summary;
  const preset = game.preset;

  const tiers = await loadCountryTiers(db);
  const nppCountries = tiers.registeredIds.filter((id) => tiers.tierOf(id) === "npp");
  if (nppCountries.length === 0) return summary;

  const [runtimes, stateRows] = await Promise.all([
    db
      .collection<{ _id: CountryId; governmentType?: string }>("countryState")
      .find({ _id: { $in: nppCountries } }, { projection: { governmentType: 1 } })
      .toArray(),
    getPartyRenewalStatesCollection(db)
      .find({ _id: { $in: nppCountries } })
      .toArray(),
  ]);
  const governmentType = new Map(runtimes.map((r) => [r._id, r.governmentType]));
  const stateByCountry = new Map(stateRows.map((s) => [s._id, s]));
  // A one-party state renews through its own faction-split mechanic.
  const countries = nppCountries.filter(
    (id) => (governmentType.get(id) ?? COUNTRY_CONFIGS[id]?.governmentType) !== "onePartyState"
  );
  if (countries.length === 0) return summary;

  const chamber = new Map(countries.map((id) => [id, lowerChamberTypes(id, preset)]));
  const elections = await db
    .collection<Election>("elections")
    .find(
      {
        $or: countries.map((id) => ({
          countryId: id,
          electionType: { $in: chamber.get(id)!.types },
          cycle: { $gt: stateByCountry.get(id)?.lastCycle ?? Number.MIN_SAFE_INTEGER },
        })),
      },
      { projection: { _id: 1, countryId: 1, electionType: 1, cycle: 1, status: 1 } }
    )
    .toArray();

  // Countries with a newly completed cycle, and that cycle's elections.
  const due = new Map<CountryId, { cycle: number; electionIds: ObjectId[] }>();
  for (const id of countries) {
    const { office } = chamber.get(id)!;
    const rows = elections.filter(
      (e) => e.countryId === id && officeKeyForElectionType(e.electionType, id, preset) === office
    );
    const cycle = latestCompleteCycle(rows, stateByCountry.get(id)?.lastCycle ?? -Infinity);
    if (cycle == null) continue;
    due.set(id, {
      cycle,
      electionIds: rows.filter((e) => e.cycle === cycle).map((e) => e._id),
    });
  }
  if (due.size === 0) return summary;
  const dueCountries = [...due.keys()];

  const [tallies, parties, officials, formations, approvals, legacyPoints] = await Promise.all([
    db
      .collection<ElectionVoteTally>("electionVoteTallies")
      .find(
        { electionId: { $in: [...due.values()].flatMap((d) => d.electionIds) } },
        { projection: { electionId: 1, totalVotes: 1, candidateParties: 1, finalized: 1 } }
      )
      .toArray(),
    db
      .collection<PartyRow>("politicalParties")
      .find(
        { countryId: { $in: dueCountries }, isDefunct: { $ne: true } },
        {
          projection: {
            _id: 1,
            sequentialId: 1,
            countryId: 1,
            name: 1,
            abbreviation: 1,
            color: 1,
            economicPosition: 1,
            socialPosition: 1,
            createdBy: 1,
            chairId: 1,
            viceChairId: 1,
            treasurerId: 1,
            nationalTaxRate: 1,
          },
        }
      )
      .toArray(),
    db
      .collection<ElectedOfficial>("electedOfficials")
      .find(
        { countryId: { $in: dueCountries } },
        { projection: { countryId: 1, officeType: 1, party: 1, state: 1, seatsHeld: 1, nppId: 1 } }
      )
      .toArray(),
    db
      .collection<GovernmentFormation>("governmentFormations")
      .find(
        { _id: { $in: dueCountries } },
        { projection: { _id: 1, governingPartyId: 1, pmNppId: 1, status: 1 } }
      )
      .toArray(),
    db
      .collection<GovernmentApproval>("governmentApprovals")
      .find({ _id: { $in: dueCountries } }, { projection: { approvalRating: 1 } })
      .toArray(),
    // A departed leader's legacy colours how the governing party's record reads.
    loadLegacyApprovalPoints(db, dueCountries, currentTurn),
  ]);

  const electionCountry = new Map<string, CountryId>();
  for (const [id, d] of due) for (const e of d.electionIds) electionCountry.set(String(e), id);
  const formationByCountry = new Map(formations.map((f) => [f._id as CountryId, f]));
  const approvalByCountry = new Map(approvals.map((a) => [a._id, a.approvalRating]));

  // Build each due country's snapshot and plan input.
  type CountryWork = {
    countryId: CountryId;
    cycle: number;
    snapshot: RenewalCycleSnapshot;
    previous: RenewalCycleSnapshot | null;
    parties: PartyRow[];
    renewalParties: RenewalParty[];
    protectedNpps: Set<string>;
  };
  const work: CountryWork[] = [];
  const stateWrites: AnyBulkWriteOperation<PartyRenewalState>[] = [];
  const now = new Date();
  for (const [countryId, { cycle }] of due) {
    const { office } = chamber.get(countryId)!;
    const countryParties = parties.filter((p) => p.countryId === countryId);
    const countryOfficials = officials.filter((o) => o.countryId === countryId);
    const voteShares = nationalVoteShares(
      tallies.filter((t) => t.finalized && electionCountry.get(String(t.electionId)) === countryId)
    );
    const seatShares = chamberSeatShares(
      countryOfficials
        .filter((o) => o.officeType === office)
        .map((o) => ({ party: o.party, seats: o.seatsHeld }))
    );
    const formation = formationByCountry.get(countryId);
    const president = countryOfficials.find((o) => o.officeType === "president" && o.party);
    const positions = countryParties.map((p) => ({
      partyId: String(p.sequentialId),
      economic: p.economicPosition ?? 0,
      social: p.socialPosition ?? 0,
    }));
    const snapshot: RenewalCycleSnapshot = {
      cycle,
      governingPartyId: formation?.governingPartyId ?? president?.party ?? null,
      approval: legacyAdjustedApproval(
        approvalByCountry.get(countryId) ?? null,
        legacyPoints.get(`${countryId}|${formation?.governingPartyId ?? president?.party ?? ""}`)
      ),
      parties: positions.map(({ partyId }) => ({
        partyId,
        voteShare: voteShares.get(partyId) ?? 0,
        seatShare: seatShares.get(partyId) ?? 0,
      })),
      gaps: ideologyGaps(ideologyAnchors(electorateCentre(positions, voteShares)), positions),
    };
    const state = stateByCountry.get(countryId);
    const cycleIndex = (state?.cycleIndex ?? 0) + 1;
    const presence = new Map<string, Set<string>>();
    for (const o of countryOfficials) {
      if (!o.party || !o.state) continue;
      const set = presence.get(o.party) ?? new Set<string>();
      set.add(o.state);
      presence.set(o.party, set);
    }
    // Claim the cycle before acting, so a retried turn never renews it twice.
    stateWrites.push({
      updateOne: {
        filter: { _id: countryId },
        update: {
          $set: {
            lastCycle: cycle,
            cycleIndex,
            snapshots: [...(state?.snapshots ?? []), snapshot].slice(-2),
            heldRegions: recordHeldRegions(state?.heldRegions ?? {}, presence, cycleIndex),
            updatedAt: now,
          },
          $setOnInsert: { events: [] },
        },
        upsert: true,
      },
    });
    const previous = state?.snapshots?.[state.snapshots.length - 1] ?? null;
    const protectedNpps = new Set<string>(
      [
        formation?.pmNppId,
        ...countryOfficials.filter((o) => o.officeType === "president").map((o) => o.nppId),
        ...countryParties.flatMap((p) => [p.chairId, p.viceChairId, p.treasurerId]),
      ].flatMap((id) => (id ? [String(id)] : []))
    );
    work.push({
      countryId,
      cycle,
      snapshot,
      previous,
      parties: countryParties,
      renewalParties: countryParties.map((p) => ({
        partyId: String(p.sequentialId),
        name: p.name,
        abbreviation: p.abbreviation,
        color: p.color,
        economic: p.economicPosition ?? 0,
        social: p.socialPosition ?? 0,
        renewable: p.createdBy == null,
      })),
      protectedNpps,
    });
  }
  await getPartyRenewalStatesCollection(db).bulkWrite(stateWrites);
  summary.countries = work.length;

  // Renewal needs two elections; a country seen for the first time only records.
  const acting = work.filter((w) => w.previous != null);
  if (acting.length === 0) return summary;
  const npps = await db
    .collection<NPP>("npps")
    .find(
      {
        countryId: { $in: acting.map((w) => w.countryId) },
        retiredAt: null,
        party: { $nin: ["independent"] },
      },
      {
        projection: {
          _id: 1,
          countryId: 1,
          party: 1,
          homeState: 1,
          "policies.economic": 1,
          "policies.social": 1,
        },
      }
    )
    .toArray();

  const eventWrites: AnyBulkWriteOperation<PartyRenewalState>[] = [];
  const news: RenewalNewsEvent[] = [];
  for (const w of acting) {
    const countryName = COUNTRY_CONFIGS[w.countryId]?.name ?? w.countryId;
    const nppsByParty = new Map<string, RenewalNpp[]>();
    for (const n of npps) {
      if (n.countryId !== w.countryId) continue;
      const list = nppsByParty.get(n.party) ?? [];
      list.push({
        nppId: String(n._id),
        homeState: n.homeState,
        economic: n.policies?.economic ?? 0,
        social: n.policies?.social ?? 0,
        protected: w.protectedNpps.has(String(n._id)),
      });
      nppsByParty.set(n.party, list);
    }
    const plan = planPartyRenewal(
      {
        previous: w.previous!,
        latest: w.snapshot,
        parties: w.renewalParties,
        nppsByParty,
      },
      makeSeededRng(`${game.resetWorldId ?? "world"}:${w.countryId}:${w.cycle}:partyRenewal`)
    );
    const events: PartyRenewalEvent[] = [];
    const bySeq = new Map(w.parties.map((p) => [String(p.sequentialId), p]));
    for (const fold of plan.folds) {
      const source = bySeq.get(fold.partyId);
      const target = bySeq.get(fold.targetPartyId);
      if (!source || !target) continue;
      try {
        await mergePartyInto(db, source._id, target._id, currentTurn, {
          requireAdjacency: false,
          enforceNppCap: false,
        });
        events.push({
          kind: "fold",
          cycle: w.cycle,
          turn: currentTurn,
          partyId: fold.partyId,
          relatedPartyId: fold.targetPartyId,
        });
        news.push({
          kind: "fold",
          countryName,
          partyName: source.name,
          relatedPartyName: target.name,
        });
        summary.folds++;
      } catch (error) {
        console.warn(`[Turn] party renewal: fold of ${w.countryId}/${fold.partyId} skipped`, error);
      }
    }
    if (plan.splinter) {
      const parent = bySeq.get(plan.splinter.parentPartyId);
      if (parent) {
        const partyId = await applySplinter(
          db,
          w.countryId,
          w.cycle,
          currentTurn,
          parent,
          plan.splinter
        );
        events.push({
          kind: "splinter",
          cycle: w.cycle,
          turn: currentTurn,
          partyId,
          relatedPartyId: plan.splinter.parentPartyId,
        });
        news.push({
          kind: "splinter",
          countryName,
          partyName: plan.splinter.name,
          relatedPartyName: parent.name,
        });
        summary.splinters++;
      }
    }
    if (plan.founding) {
      const partyId = await applyFounding(db, w.countryId, w.cycle, currentTurn, plan.founding);
      events.push({ kind: "founding", cycle: w.cycle, turn: currentTurn, partyId });
      news.push({ kind: "founding", countryName, partyName: plan.founding.name });
      summary.foundings++;
    }
    if (events.length > 0) {
      console.log(
        `[Turn] party renewal ${w.countryId} cycle ${w.cycle}: ${events
          .map((e) => `${e.kind} ${e.partyId}`)
          .join(", ")}`
      );
      eventWrites.push({
        updateOne: {
          filter: { _id: w.countryId },
          update: { $push: { events: { $each: events, $slice: -MAX_EVENTS } } },
        },
      });
    }
  }
  if (eventWrites.length > 0) {
    await getPartyRenewalStatesCollection(db).bulkWrite(eventWrites);
  }
  // Players see the map change in the news feed. A failed post never undoes
  // the renewal it reports.
  for (const event of news) {
    const { title, content } = renewalNewsPost(event);
    try {
      await createSystemNewsPost(content, "election", { title, db });
    } catch (error) {
      console.warn(`[Turn] party renewal: news post skipped`, error);
    }
  }
  return summary;
}

function newPartyDoc(
  countryId: CountryId,
  sequentialId: number,
  plan: Pick<SplinterPlan | FoundingPlan, "name" | "abbreviation" | "color" | "position">,
  currentTurn: number,
  nationalTaxRate: number,
  renewalOrigin: NonNullable<PoliticalParty["renewalOrigin"]>
): PoliticalParty {
  const now = new Date();
  return {
    _id: new ObjectId(),
    sequentialId,
    countryId,
    name: plan.name,
    abbreviation: plan.abbreviation,
    color: plan.color,
    economicPosition: plan.position.economic,
    socialPosition: plan.position.social,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    campaignerIds: [],
    committeeIds: [],
    memberCount: 0,
    isDefault: false,
    createdBy: null,
    treasury: 0,
    nationalTaxRate,
    politicalStrength: 0,
    createdTurn: currentTurn,
    renewalOrigin,
    createdAt: now,
    updatedAt: now,
  };
}

/** A starting organisation row so the party can field candidates in a region. */
function baseOrgRow(countryId: CountryId, stateId: string, partyId: string, turn: number) {
  const now = new Date();
  return {
    _id: `${stateId}_${partyId}`,
    countryId,
    stateId,
    partyId,
    organization: 0,
    organizationUnits: ORG_BUILD_UNITS_PER_CLICK,
    lastOrganizationBuildTurn: turn,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    treasury: 0,
    stateTaxRate: 0,
    politicalStrength: 0,
    hasPresence: true,
    createdAt: now,
    updatedAt: now,
  } as StatePartyOrg;
}

/** Create the splinter party and move its faction, seats and candidacies with it. */
async function applySplinter(
  db: Db,
  countryId: CountryId,
  cycle: number,
  currentTurn: number,
  parent: PartyRow,
  plan: SplinterPlan
): Promise<string> {
  const seq = await getNextSequentialId(db, "party", countryId);
  const partyId = String(seq);
  await db.collection<PoliticalParty>("politicalParties").insertOne(
    newPartyDoc(countryId, seq, plan, currentTurn, parent.nationalTaxRate ?? 0, {
      kind: "splinter",
      cycle,
      parentPartyId: String(parent.sequentialId),
    })
  );
  const regions = plan.baseRegions.slice(0, MAX_SPLINTER_BASE_REGIONS);
  if (regions.length > 0) {
    await db
      .collection<StatePartyOrg>("statePartyOrg")
      .insertMany(regions.map((stateId) => baseOrgRow(countryId, stateId, partyId, currentTurn)));
  }
  const nppIds = plan.nppIds.map((id) => new ObjectId(id));
  const parentId = String(parent.sequentialId);
  const now = new Date();
  await Promise.all([
    db
      .collection<NPP>("npps")
      .updateMany(
        { _id: { $in: nppIds }, party: parentId },
        { $set: { party: partyId, updatedAt: now } }
      ),
    // Seats follow the people who hold them.
    db
      .collection<ElectedOfficial>("electedOfficials")
      .updateMany({ countryId, nppId: { $in: nppIds } }, { $set: { party: partyId } }),
    // NPP candidacies carry the NPP id as characterId; live ones run under the new banner.
    db
      .collection("electionCandidates")
      .updateMany(
        { party: parentId, status: "active", characterId: { $in: nppIds } },
        { $set: { party: partyId } }
      ),
    db
      .collection("campaigns")
      .updateMany(
        { party: parentId, candidateId: { $in: nppIds }, status: { $ne: "archived" } },
        { $set: { party: partyId, updatedAt: now } }
      ),
  ]);
  const gov = await db
    .collection<GovernmentFormation>("governmentFormations")
    .findOne({ _id: countryId }, { projection: { _id: 1 } });
  if (gov) {
    const { updateParliamentaryGovernmentSeats } =
      await import("@/lib/turn/parliamentaryGovernment");
    await updateParliamentaryGovernmentSeats(db, countryId);
  }
  return partyId;
}

/** Create the founded party with a small bench in its least-organised region. */
async function applyFounding(
  db: Db,
  countryId: CountryId,
  cycle: number,
  currentTurn: number,
  plan: FoundingPlan
): Promise<string> {
  const [regions, orgs, names] = await Promise.all([
    db
      .collection<{ _id: string }>("states")
      .find({ countryId }, { projection: { _id: 1 } })
      .toArray(),
    db
      .collection<StatePartyOrg>("statePartyOrg")
      .find({ countryId }, { projection: { stateId: 1, organization: 1 } })
      .toArray(),
    db
      .collection<NPP>("npps")
      .find({ retiredAt: null }, { projection: { name: 1 } })
      .toArray(),
  ]);
  const orgByRegion = new Map<string, number>();
  for (const row of orgs) {
    orgByRegion.set(row.stateId, (orgByRegion.get(row.stateId) ?? 0) + (row.organization ?? 0));
  }
  const base = regions
    .map((r) => r._id)
    .sort((a, b) => (orgByRegion.get(a) ?? 0) - (orgByRegion.get(b) ?? 0) || a.localeCompare(b))[0];

  const seq = await getNextSequentialId(db, "party", countryId);
  const partyId = String(seq);
  await db
    .collection<PoliticalParty>("politicalParties")
    .insertOne(newPartyDoc(countryId, seq, plan, currentTurn, 0, { kind: "founding", cycle }));
  if (!base) return partyId;
  await db
    .collection<StatePartyOrg>("statePartyOrg")
    .insertOne(baseOrgRow(countryId, base, partyId, currentTurn));
  const context: NPPGenerationContext = { existingNames: new Set(names.map((n) => n.name)) };
  for (let i = 0; i < FOUNDING_BENCH_SIZE; i++) {
    await createNPP({ state: base, party: partyId, countryId }, context);
  }
  return partyId;
}
