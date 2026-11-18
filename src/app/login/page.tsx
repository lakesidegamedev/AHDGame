import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import LoginPageClient from "./LoginPageClient";
import { isMissingRequiredEnvError } from "@/lib/config/validatedEnv";
import { getDb } from "@/lib/mongodb";
import type { GameConfig } from "@/lib/db/types";
import { normalizeMaintenanceMode } from "@/lib/maintenanceStatus";
import { isMarginOfVictoryLogin } from "@/lib/auth/lakesideLoginReturn";
import { computeIntakeStatus } from "@/lib/auth/intakeStatus";
import { getEraConfig } from "@/components/landing/eraThemes";
import { getLoginImage } from "@/lib/images/staticCdnAssets";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";

type LoginPageProps = {
  searchParams: Promise<{ returnTo?: string | string[] }>;
};

function usesMarginOfVictoryBrand(returnTo?: string | string[]): boolean {
  return isMarginOfVictoryLogin(typeof returnTo === "string" ? returnTo : null);
}

export async function generateMetadata({ searchParams }: LoginPageProps): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  const marginOfVictory = usesMarginOfVictoryBrand((await searchParams).returnTo);
  return marginOfVictory
    ? { title: { absolute: t("movTitle") }, description: t("movDescription") }
    : { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const marginOfVictory = usesMarginOfVictoryBrand((await searchParams).returnTo);
  let maintenanceMode = false;
  let registrationOpen = true;
  let wireframeColor: string | undefined;
  let eraLabel: string | undefined;
  let eraTagline: string | undefined;
  let loginImageUrl: string | undefined;

  try {
    const db = await getDb();
    const config = await gameConfigCollection(db).findOne(
      { _id: "default" },
      { projection: { maintenanceMode: 1, registrationEnabled: 1, seedYear: 1 } }
    );

    // The login page only ever needs "is maintenance active at all" — no
    // partial-specific copy here (MaintenancePartialBanner carries the
    // player-facing partial notice).
    maintenanceMode = normalizeMaintenanceMode(config?.maintenanceMode) !== "off";
    registrationOpen = computeIntakeStatus(config).registration.open;
    const eraConfig = getEraConfig(config?.seedYear ?? 1979);
    wireframeColor = eraConfig.wireframeColor ?? undefined;
    eraLabel = eraConfig.label;
    eraTagline = eraConfig.loginTagline;
    // Pass image only when an era-specific file is on the CDN (wireframe eras render it ghosted behind scanlines)
    // Fallback to Lincoln memorial for unknown/missing seedYear so production worlds seeded before
    // the era system don't get a broken CRT wireframe login.
    loginImageUrl = getLoginImage(eraConfig.year);
  } catch (error) {
    if (!isMissingRequiredEnvError(error)) {
      console.error("Failed to load login page config:", error);
    }
  }

  return (
    <LoginPageClient
      marginOfVictory={marginOfVictory}
      initialMaintenanceMode={maintenanceMode}
      registrationOpen={registrationOpen}
      wireframeColor={wireframeColor}
      eraLabel={eraLabel}
      eraTagline={eraTagline}
      loginImageUrl={loginImageUrl}
    />
  );
}
