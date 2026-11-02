"use client";

import { useTranslations } from "next-intl";
import { BlendShell } from "@/components/blend/BlendShell";
import { BLEND, FONT } from "@/components/blend/tokens";
import { useRaceIndex } from "./useRaceIndex";

export interface CampaignManagerClientProps {
  countryId: string;
  countryName: string;
  regionNoun: string;
  regionNames: Record<string, string>;
  nationalChamberKeys: string[];
  characterId: string;
  homeRegionId: string | null;
  initialRaceKey: string | null;
}

/**
 * The Campaign Manager screen. Owns what is selected (race type, stage, region,
 * race, candidate, right-rail tab) and the data hooks; the panels are
 * presentational over that state.
 */
export default function CampaignManagerClient(props: CampaignManagerClientProps) {
  const t = useTranslations("elections.campaignManager");
  const { loading, error, reload } = useRaceIndex(props.countryId, props.nationalChamberKeys);

  return (
    <div
      style={{
        background: BLEND.page,
        color: BLEND.ink,
        fontFamily: FONT.sans,
        minHeight: "100vh",
      }}
    >
      <BlendShell fullBleed leftWidth={320} rightWidth={360}>
        <section style={{ padding: 24 }} aria-busy={loading}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{t("title")}</h1>
          {loading ? <p style={{ color: BLEND.muted }}>{t("loading")}</p> : null}
          {!loading && error ? (
            <p role="alert" style={{ color: BLEND.negative }}>
              {t("loadError")}{" "}
              <button type="button" onClick={reload}>
                {t("retry")}
              </button>
            </p>
          ) : null}
        </section>
      </BlendShell>
    </div>
  );
}
