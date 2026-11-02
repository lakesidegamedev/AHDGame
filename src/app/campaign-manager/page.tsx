import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuthUserWithCharacter } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { getCountryConfig, type CountryId } from "@/lib/constants/countries";
import { ObjectId } from "mongodb";
import type { Election, State } from "@/lib/db/types";
import { campaignManagerCountry, presidentialRedirect } from "@/lib/campaignManager/links";
import { parseCampaignManagerParams } from "@/lib/campaignManager/linkParams";
import CampaignManagerClient from "./CampaignManagerClient";

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
  if (!user?.hasCharacter || !user.character) {
    redirect("/unauthorized?reason=You need a character to use the Campaign Manager");
  }
  const character = user.character;
  const homeCountryId = (character.countryId ?? "US") as CountryId;
  const db = await getDb();
  // Deep-link params (race, type, stage, region, year, party, country); junk is dropped.
  const { race, filter, country: countryParam } = parseCampaignManagerParams(await searchParams);
  // Links that know only a race id land here; the presidency has its own page.
  const linked = race
    ? await db
        .collection<Election>("elections")
        .findOne(
          { _id: new ObjectId(race.split(":")[0]) },
          { projection: { _id: 1, electionType: 1, seatId: 1, countryId: 1 } }
        )
    : null;
  const elsewhere = presidentialRedirect(linked);
  if (elsewhere) redirect(elsewhere);

  // Any country's races can be viewed: a linked race opens in its own country.
  const wanted = campaignManagerCountry(homeCountryId, linked, countryParam) as CountryId;
  const countryId = getCountryConfig(wanted) ? wanted : homeCountryId;
  const config = getCountryConfig(countryId);
  const regions = await db
    .collection<State>("states")
    .find({ countryId }, { projection: { _id: 1, name: 1 } })
    .toArray();
  const regionNames = Object.fromEntries(
    regions.map((r) => [String(r._id), r.name ?? String(r._id)])
  );
  const nationalChamberKeys = [
    config.legislature?.lowerChamber?.key,
    config.legislature?.upperChamber?.key,
  ].filter((k): k is string => !!k);

  return (
    <CampaignManagerClient
      // A new country is a new page: type, region and selection start over.
      key={countryId}
      countryId={countryId}
      countryName={config.name}
      regionNoun={config.regionLabel ?? "Region"}
      regionNounPlural={config.regionLabelPlural ?? "Regions"}
      regionNames={regionNames}
      nationalChamberKeys={nationalChamberKeys}
      characterId={String(character._id)}
      homeRegionId={character.homeState ?? null}
      initialRaceKey={race}
      initialFilter={filter}
    />
  );
}
