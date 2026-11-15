import { NationalImpeachmentAction } from "@/components/legislation/NationalImpeachmentAction";
import { NationalPartyBillAction } from "@/components/legislation/NationalPartyBillAction";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { getDb } from "@/lib/mongodb";
import { getGameStatePreset } from "@/lib/db/collections/gameState";
import { getLiveLowerChamberSeats } from "@/lib/legislature/lowerChamberSeats";
import { bgAssemblyName } from "@/lib/countries/bg/rules/assemblyTransition";
import { getCountryConfigForRuntime } from "@/lib/constants/countries";
import LegislatureClient from "./LegislatureClient";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { countryGameStatesCollection } from "@/lib/db/repositories/countryGameStates";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ code: string }>;
}

async function bgLegislaturePresentation(): Promise<{ name: string; seats: number }> {
  const db = await getDb();
  const [preset, country, seats] = await Promise.all([
    getGameStatePreset(db),
    countryGameStatesCollection<{
      _id: string;
      bgOrdinaryAssemblySinceTurn?: number;
      bgGrandAssemblyContinuationSinceTurn?: number;
      bgConstitution1991SinceTurn?: number;
      bgGrandAssemblyDissolutionSinceTurn?: number;
    }>(db).findOne(
      { _id: "BG" },
      { projection: { bgOrdinaryAssemblySinceTurn: 1, bgGrandAssemblyContinuationSinceTurn: 1 } }
    ),
    getLiveLowerChamberSeats(db, "BG"),
  ]);
  return {
    name: bgAssemblyName(preset, country?.bgOrdinaryAssemblySinceTurn, country ?? undefined),
    seats,
  };
}

async function ruLegislaturePresentation(): Promise<{
  name: string;
  seats: number;
  generic: boolean;
}> {
  const db = await getDb();
  const [preset, country] = await Promise.all([
    getGameStatePreset(db),
    countryGameStatesCollection<{
      _id: string;
      ruSovietSuccessionSinceTurn?: number;
      ruProvisionalCongressSeats?: number;
      ruPresidencySinceTurn?: number;
      ruCongressDissolvedSinceTurn?: number;
      ruFederalAssemblySinceTurn?: number;
    }>(db).findOne({ _id: "RU" }),
  ]);
  const config = getCountryConfigForRuntime("RU", preset, country);
  const generic = preset === "1991-default";
  const seats = generic
    ? await getLiveLowerChamberSeats(db, "RU")
    : config.legislature.lowerChamber.seats;
  return { name: config.legislature.name, seats, generic };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const id = code.toUpperCase() as CountryId;
  const config = COUNTRY_CONFIGS[id];
  if (!config) return { title: "Legislature not found | A House Divided" };
  if (countryHasFeature("bgUi", id)) {
    const { name, seats } = await bgLegislaturePresentation();
    return {
      title: `${name} | A House Divided`,
      description: `Bulgaria ${name}, ${seats} deputies`,
    };
  }
  if (countryHasFeature("ruUi", id)) {
    const { name, seats } = await ruLegislaturePresentation();
    return {
      title: `${name} | A House Divided`,
      description: `Russia ${name}, ${seats} lower-chamber seats`,
    };
  }
  return {
    title: `${config.legislature.name} | A House Divided`,
    description: `${config.name} ${config.legislature.name} — ${config.legislature.lowerChamber.seats} ${config.regionLabelPlural}`,
  };
}

export default async function LegislaturePage({ params }: PageProps) {
  const { code } = await params;
  const id = code.toUpperCase() as CountryId;
  if (!COUNTRY_CONFIGS[id]) notFound();
  const bgName = countryHasFeature("bgUi", id)
    ? (await bgLegislaturePresentation()).name
    : undefined;
  const ru = countryHasFeature("ruUi", id) ? await ruLegislaturePresentation() : undefined;
  const hungarianElectoralDecisions =
    countryHasFeature("huUi", id) && (await getGameStatePreset(await getDb())) === "1991-default";
  return (
    <>
      <NationalPartyBillAction countryId={id} />
      <NationalImpeachmentAction countryId={id} />
      <LegislatureClient
        countryId={id}
        legislatureName={ru?.name ?? bgName}
        generic={ru?.generic}
        hungarianElectoralDecisions={hungarianElectoralDecisions}
        bulgarianConstitutionalDecision={
          countryHasFeature("bgUi", id) &&
          (await getGameStatePreset(await getDb())) === "1991-default"
        }
        romanianElectoralDecision={
          countryHasFeature("roUi", id) &&
          (await getGameStatePreset(await getDb())) === "1991-default"
        }
      />
    </>
  );
}
