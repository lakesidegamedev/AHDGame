import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuthUserWithCharacter } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { getCountryConfig, type CountryId } from "@/lib/constants/countries";
import type { State } from "@/lib/db/types";
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
  searchParams: Promise<{ race?: string }>;
}) {
  const user = await getAuthUserWithCharacter();
  if (!user?.hasCharacter || !user.character) {
    redirect("/unauthorized?reason=You need a character to use the Campaign Manager");
  }
  const character = user.character;
  const countryId = (character.countryId ?? "US") as CountryId;
  const config = getCountryConfig(countryId);
  const db = await getDb();
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
  const { race } = await searchParams;

  return (
    <CampaignManagerClient
      countryId={countryId}
      countryName={config.name}
      regionNoun={config.regionLabel ?? "Region"}
      regionNounPlural={config.regionLabelPlural ?? "Regions"}
      regionNames={regionNames}
      nationalChamberKeys={nationalChamberKeys}
      characterId={String(character._id)}
      homeRegionId={character.homeState ?? null}
      initialRaceKey={race ?? null}
    />
  );
}
