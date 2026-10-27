import { notFound } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { getAuthUserWithCharacter } from "@/lib/auth";
import { resolvePartyNppProposalAccess } from "@/lib/legislature/queries/partyNppProposalAccess";
import { RESET_V2_READY } from "@/lib/resetVersions/availability";
import { resetSystemVersionsForCountry } from "@/lib/resetVersions/rules";
import type { State } from "@/lib/db/types";
import { canonicalRegionId, type CountryId } from "@/lib/constants/countries";
import { subNationalChamberSeats } from "@/lib/constants/states";
import { getGameStateCollection } from "@/lib/db/collections/gameState";

import { StateLegislatureClient } from "./StateLegislatureClient";

export default async function StateLegislaturePage({
  params,
}: {
  params: Promise<{ code: string; id: string }>;
}) {
  const { code, id: rawRegionParam } = await params;
  const id = canonicalRegionId(code.toUpperCase(), rawRegionParam);
  const stateId = id.toUpperCase();
  const countryId = code.toUpperCase() as CountryId;
  const db = await getDb();

  // The session, the state document and the world preset are independent; the
  // preset used to be awaited inside the JSX props, after everything else, so
  // it was always a third serial round trip.
  const [state, auth, gameState] = await Promise.all([
    db.collection<State>("states").findOne({
      _id: stateId,
      countryId,
    }),
    getAuthUserWithCharacter(),
    getGameStateCollection(db).then((collection) =>
      collection.findOne(
        { _id: "current" },
        {
          projection: {
            preset: 1,
            resetWorldId: 1,
            resetVersionSeeds: 1,
            metricsSystemVersion: 1,
            legislationSystemVersion: 1,
          },
        }
      )
    ),
  ]);

  if (!state) {
    notFound();
  }

  const partyAccess = await resolvePartyNppProposalAccess(db, countryId, stateId, auth?.character);

  return (
    <StateLegislatureClient
      legislationVersion={
        resetSystemVersionsForCountry(gameState, RESET_V2_READY, countryId).legislation
      }
      canProposeViaPartyNpp={partyAccess.authorized && partyAccess.npp !== null}
      stateId={state._id}
      countryId={code.toUpperCase()}
      stateName={state.name}
      totalSeats={subNationalChamberSeats(countryId, state, gameState?.preset)}
      isLoggedIn={!!auth}
      characterId={auth?.character?._id.toString()}
      isAdmin={auth?.isAdmin ?? false}
    />
  );
}
