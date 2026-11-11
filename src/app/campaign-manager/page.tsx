import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuthUserWithCharacter } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { getCountryConfig, type CountryId } from "@/lib/constants/countries";
import { loadCountryNameOverrides } from "@/lib/country/countryIdentity";
import { getGameStatePreset } from "@/lib/db/collections/gameState";
import { ObjectId } from "mongodb";
import type { Election, State } from "@/lib/db/types";
import { campaignManagerCountry, presidentialRedirect } from "@/lib/campaignManager/links";
import { parseCampaignManagerParams } from "@/lib/campaignManager/linkParams";
import {
  campaignManagerCountryView,
  type CountryRuntimeState,
} from "@/lib/campaignManager/countryView";
import CampaignManagerClient from "./CampaignManagerClient";
import { statesCollection } from "@/lib/db/repositories/states";
import { electionsCollection } from "@/lib/db/repositories/elections";
import { countryGameStatesCollection } from "@/lib/db/repositories/countryGameStates";

export const metadata: Metadata = { title: "Campaign Manager" };

/**
 * Campaign Manager: every race in the player's country, its map down to
 * sub-units, and the player's own and targeted actions in one place.
 * Region names and the national chambers come from the server so the client
 * can label and group races without a lookup of its own.
 */
export default async function CampaignManagerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getAuthUserWithCharacter();
  // Results stay public; only the action controls require a character.
  const character = user?.hasCharacter ? user.character : null;
  const homeCountryId = (character?.countryId ?? "US") as CountryId;
  const db = await getDb();
  // Deep-link params (race, type, stage, region, year, party, country); junk is dropped.
  const { race, filter, country: countryParam } = parseCampaignManagerParams(await searchParams);
  // Links that know only a race id land here; the presidency has its own page.
  const linked = race
    ? await electionsCollection(db).findOne(
        { _id: new ObjectId(race.split(":")[0]) },
        { projection: { _id: 1, electionType: 1, seatId: 1, countryId: 1 } }
      )
    : null;
  const elsewhere = presidentialRedirect(linked);
  if (elsewhere) redirect(elsewhere);

  // Any country's races can be viewed: a linked race opens in its own country.
  const wanted = campaignManagerCountry(homeCountryId, linked, countryParam) as CountryId;
  const countryId = getCountryConfig(wanted) ? wanted : homeCountryId;
  const [regions, preset, countryState, nameOverrides] = await Promise.all([
    statesCollection(db)
      .find({ countryId }, { projection: { _id: 1, name: 1 } })
      .toArray(),
    getGameStatePreset(db),
    countryGameStatesCollection<{ _id: string } & NonNullable<CountryRuntimeState>>(db).findOne({
      _id: countryId,
    }),
    loadCountryNameOverrides(db),
  ]);
  const view = campaignManagerCountryView(countryId, preset, countryState, nameOverrides);
  const regionNames = Object.fromEntries(
    regions.map((r) => [String(r._id), r.name ?? String(r._id)])
  );

  return (
    <CampaignManagerClient
      // A new country is a new page: type, region and selection start over.
      key={countryId}
      countryId={countryId}
      countryName={view.countryName}
      regionNoun={view.regionNoun}
      regionNounPlural={view.regionNounPlural}
      regionNames={regionNames}
      nationalChamberKeys={view.nationalChamberKeys}
      characterId={character ? String(character._id) : ""}
      homeRegionId={character?.homeState ?? null}
      initialRaceKey={race}
      initialFilter={filter}
    />
  );
}
