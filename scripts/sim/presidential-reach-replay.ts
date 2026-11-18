/**
 * Presidential name-recognition replay. READ ONLY (engine dry run).
 *
 * Runs the real presidential engine against the live race with alternative
 * national-influence (reach) rules expressed as per-candidate overrides, and
 * reports the marginal turn share, projected final share and EV per variant.
 *
 * Run: npx tsx scripts/sim/presidential-reach-replay.ts
 */
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import {
  accumulatePresidentVoteTurn,
  type PresidentVoteTurnDryRun,
} from "@/lib/elections/presidential/presidentialElectionEngine";
import { turnVoteWeight } from "@/lib/elections/engine/voteCalculations";
import { loadApportionment } from "@/lib/elections/apportionment";

const COUNTRY = process.env.COUNTRY ?? "US";

type Cand = { id: string; name: string; ni: number; mateNi: number };
type Variant = { label: string; ni?: (c: Cand) => number; floor?: number };

const VARIANTS: Variant[] = (process.env.FLOORS ?? "0,25").split(",").map((f) => ({
  label: `floor ${f}`,
  floor: Number(f),
}));

const sum = (o: Record<string, number>) => Object.values(o).reduce((s, v) => s + v, 0);

async function main() {
  const db = await getDb();
  const election = await db
    .collection("elections")
    .findOne({ countryId: COUNTRY, electionType: "president", status: "active" });
  if (!election) throw new Error("no active presidential election");
  const gs = await db.collection("gameState").findOne({ _id: "current" as never });
  const currentTurn = (gs?.currentTurn as number) ?? 0;
  const endTurn = election.endTurn as number;
  const generalStart = (election.primaryEndTurn as number) ?? (election.startTurn as number);

  const tally = await db.collection("electionVoteTallies").findOne({ electionId: election._id });
  const unitBefore = (tally?.totalVotesByUnit ?? {}) as Record<string, Record<string, number>>;

  const candDocs = await db
    .collection("electionCandidates")
    .find({ electionId: election._id, status: "active" })
    .toArray();
  const charIds = candDocs.flatMap((c) => [c.characterId, c.runningMateId].filter(Boolean));
  const chars = new Map(
    (
      await db
        .collection("characters")
        .find({ _id: { $in: charIds } })
        .toArray()
    ).map((c) => [String(c._id), c])
  );
  const cands: Cand[] = candDocs.map((c) => ({
    id: String(c._id),
    name: c.characterName as string,
    ni: (chars.get(String(c.characterId))?.nationalInfluence as number) ?? 0,
    mateNi: (chars.get(String(c.runningMateId))?.nationalInfluence as number) ?? 0,
  }));
  const [R, D] = [
    cands.find((c) => candDocs.find((d) => String(d._id) === c.id)?.party === "2")!,
    cands.find((c) => candDocs.find((d) => String(d._id) === c.id)?.party === "1")!,
  ];

  const { electoralVoteUnits } = await loadApportionment(db, gs?.preset, gs?.currentYear);
  const totalTurns = Math.max(4, endTurn - generalStart);
  let castFrac = 0;
  for (let t = generalStart; t <= currentTurn && t < endTurn; t++) {
    castFrac += turnVoteWeight(
      totalTurns,
      Math.max(0, Math.min(t - generalStart, totalTurns - 1)),
      1
    );
  }
  const remaining = Math.max(0, Math.min(1, 1 - castFrac));

  let cumR = 0;
  let cumAll = 0;
  for (const b of Object.values(unitBefore)) {
    cumR += b[R.id] ?? 0;
    cumAll += sum(b);
  }
  console.log(`turn ${currentTurn}/${endTurn}, uncast ${(remaining * 100).toFixed(1)}%`);
  for (const c of [R, D])
    console.log(`  ${c.name}: NI ${c.ni.toFixed(1)}, mate NI ${c.mateNi.toFixed(1)}`);
  console.log(`  cumulative R share ${((100 * cumR) / cumAll).toFixed(1)}%\n`);
  console.log(
    "variant".padEnd(38) +
      "NI R/D".padEnd(13) +
      "turn R%".padEnd(9) +
      "proj R%".padEnd(9) +
      "EV R/D now".padEnd(12) +
      "EV R/D fresh race"
  );

  for (const v of VARIANTS) {
    const override = v.ni ? { [R.id]: v.ni(R), [D.id]: v.ni(D) } : { [R.id]: R.ni, [D.id]: D.ni };
    const run = (await accumulatePresidentVoteTurn(
      election._id as ObjectId,
      currentTurn + 1,
      new Date(),
      {
        dryRun: true,
        ...(v.ni ? { nationalInfluenceOverride: override } : {}),
        ...(v.floor != null ? { rulesetOverride: { generalNomineeReachFloorNI: v.floor } } : {}),
      }
    )) as PresidentVoteTurnDryRun;

    // Sum districts for derived at-large legs.
    const margByUnit = new Map<string, Record<string, number>>();
    for (const [unit, after] of Object.entries(run.totalVotesByUnit)) {
      const before = unitBefore[unit] ?? {};
      const m: Record<string, number> = {};
      for (const id of run.candidateIds) m[id] = (after[id] ?? 0) - (before[id] ?? 0);
      margByUnit.set(unit, m);
    }
    let mR = 0;
    let mAll = 0;
    let evR = 0,
      evD = 0,
      fR = 0,
      fD = 0;
    for (const u of electoralVoteUnits) {
      let before: Record<string, number>;
      let marg: Record<string, number>;
      if (u.derivesFromDistricts) {
        const legs = electoralVoteUnits.filter(
          (x) => x.stateId === u.stateId && !x.derivesFromDistricts
        );
        before = {};
        marg = {};
        for (const l of legs)
          for (const id of run.candidateIds) {
            before[id] = (before[id] ?? 0) + (unitBefore[l.unitId]?.[id] ?? 0);
            marg[id] = (marg[id] ?? 0) + (margByUnit.get(l.unitId)?.[id] ?? 0);
          }
      } else {
        before = unitBefore[u.unitId] ?? {};
        marg = margByUnit.get(u.unitId) ?? {};
        mR += marg[R.id] ?? 0;
        mAll += sum(marg);
      }
      const cT = sum(before),
        mT = sum(marg);
      const cS = cT > 0 ? (before[R.id] ?? 0) / cT : 0;
      const mS = mT > 0 ? (marg[R.id] ?? 0) / mT : 0;
      const proj = cS * (1 - remaining) + mS * remaining;
      if (proj > 0.5) evR += u.ev;
      else evD += u.ev;
      if (mS > 0.5) fR += u.ev;
      else fD += u.ev;
    }
    const mNat = (100 * mR) / mAll;
    const proj = ((100 * cumR) / cumAll) * (1 - remaining) + mNat * remaining;
    for (const alpha of (process.env.ALPHAS ?? "").split(",").filter(Boolean).map(Number)) {
      let bkR = 0,
        bkD = 0,
        aR = 0,
        aD = 0,
        cR = 0,
        cAll = 0,
        pR = 0,
        pAll = 0;
      for (const u of electoralVoteUnits) {
        const legs = u.derivesFromDistricts
          ? electoralVoteUnits.filter((x) => x.stateId === u.stateId && !x.derivesFromDistricts)
          : [u];
        let bR = 0,
          bAll = 0,
          mR2 = 0,
          mAll2 = 0;
        for (const l of legs) {
          const b = unitBefore[l.unitId] ?? {};
          const m = margByUnit.get(l.unitId) ?? {};
          const bt = sum(b),
            mt = sum(m);
          const fair = mt > 0 ? (m[R.id] ?? 0) / mt : 0;
          bR += (1 - alpha) * (b[R.id] ?? 0) + alpha * bt * fair;
          bAll += bt;
          mR2 += m[R.id] ?? 0;
          mAll2 += mt;
        }
        if (!u.derivesFromDistricts) {
          cR += bR;
          cAll += bAll;
          pR += mR2;
          pAll += mAll2;
        }
        const cS = bAll > 0 ? bR / bAll : 0,
          mS = mAll2 > 0 ? mR2 / mAll2 : 0;
        if (cS * (1 - remaining) + mS * remaining > 0.5) aR += u.ev;
        else aD += u.ev;
        if (cS > 0.5) bkR += u.ev;
        else bkD += u.ev;
      }
      const projPv = (cR / cAll) * (1 - remaining) + (pR / pAll) * remaining;
      console.log(
        `   alpha ${alpha.toFixed(2)}: banked R ${((100 * cR) / cAll).toFixed(1)}%  projected R ${(100 * projPv).toFixed(1)}%  projected EV ${aR}/${aD}  map now (banked) ${bkR}/${bkD}`
      );
    }
    console.log(
      v.label.padEnd(38) +
        `${override[R.id].toFixed(1)}/${override[D.id].toFixed(1)}`.padEnd(13) +
        mNat.toFixed(1).padEnd(9) +
        proj.toFixed(1).padEnd(9) +
        `${evR}/${evD}`.padEnd(12) +
        `${fR}/${fD}`
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
