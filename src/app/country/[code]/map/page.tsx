import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { getCountryClientConfig } from "@/lib/constants/countryClientConfig";
import { notFound } from "next/navigation";
import { getGameState } from "@/lib/gameState";
import { getDb } from "@/lib/mongodb";
import { resolveCountryIdentity } from "@/lib/country/countryIdentity";
import CountryMapClient from "./CountryMapClient";

interface Props {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { code } = await params;
  const countryId = code.toUpperCase() as CountryId;
  if (!Object.hasOwn(COUNTRY_CONFIGS, countryId)) notFound();
  const gameState = await getGameState();
  const { name } = await resolveCountryIdentity(await getDb(), countryId, gameState?.preset);

  return {
    title: `${name} Map | A House Divided`,
    description: `Interactive electoral map of ${name}`,
  };
}

export default async function CountryMapPage({ params }: Props) {
  const { code } = await params;
  const countryId = code.toUpperCase() as CountryId;
  if (!Object.hasOwn(COUNTRY_CONFIGS, countryId)) notFound();
  const config = getCountryClientConfig(countryId);
  return (
    <CountryMapClient
      countryId={countryId}
      config={{ id: config.id, name: config.name, overviewPath: config.overviewPath }}
    />
  );
}
