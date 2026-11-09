"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CountryId } from "@/lib/constants/countriesCore";
import { referendumDetailUrl } from "@/lib/urls";

/** Campaign-relevant slice of a referendum from `/api/country/[code]/referendum`. */
interface CampaignReferendum {
  id: string;
  regionId: string;
  kind: "independence" | "reunification" | "peace_agreement";
  status: "requested" | "granted" | "campaigning" | "actuating";
  campaignCloseTurn: number | null;
  yesShare: number;
}

interface ReferendumResponse {
  referendums: CampaignReferendum[];
  currentTurn: number;
}

/**
 * Region-page banner for a live referendum campaign: a read-only Yes/No support
 * bar + a link to the dedicated campaign page, where the spend actions live.
 * Scoped to one region and the `campaigning` phase.
 */
export function RegionReferendumCampaign({
  countryId,
  regionId,
}: {
  countryId: CountryId;
  regionId: string;
}) {
  const t = useTranslations("nav.devolution");
  const [data, setData] = useState<ReferendumResponse | null>(null);

  const load = useCallback(async () => {
    if (countryId !== "UK") return;
    try {
      const res = await fetch(`/api/country/${countryId.toLowerCase()}/referendum`);
      if (!res.ok) return;
      setData((await res.json()) as ReferendumResponse);
    } catch {
      // Non-critical surface — stay silent on transient fetch failures.
    }
  }, [countryId]);

  useEffect(() => {
    void load(); // eslint-disable-line react-hooks/set-state-in-effect -- initial data fetch
  }, [load]);

  if (countryId !== "UK" || !data) return null;
  const ref = data.referendums.find(
    (r) => r.regionId.toUpperCase() === regionId.toUpperCase() && r.status === "campaigning"
  );
  if (!ref) return null;

  const yes = Math.round(ref.yesShare);
  const turnsLeft = ref.campaignCloseTurn != null ? ref.campaignCloseTurn - data.currentTurn : null;

  return (
    <section
      aria-labelledby={`referendum-campaign-${regionId.toLowerCase()}`}
      className="mb-6 overflow-hidden rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-5 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <span className="inline-flex rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
            {t("activeCampaign")}
          </span>
          <h2
            id={`referendum-campaign-${regionId.toLowerCase()}`}
            className="text-lg font-semibold"
          >
            {t("campaignTitle", { kind: ref.kind })}
          </h2>
          <p className="text-sm text-muted">{t("campaignLinkHelp")}</p>
        </div>
        <Link
          href={referendumDetailUrl(countryId, regionId)}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
        >
          {t("viewCampaign")} <span aria-hidden="true">→</span>
        </Link>
      </div>
      <div className="mt-5 space-y-2">
        <div className="flex justify-between text-xs text-muted">
          <span>{t("campaignYesSupport", { value: yes })}</span>
          <span>{t("campaignNoSupport", { value: 100 - yes })}</span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-background/60"
          role="progressbar"
          aria-valuenow={yes}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("campaignSupportLabel", { kind: ref.kind })}
        >
          <div className="h-full bg-primary" style={{ width: `${ref.yesShare}%` }} />
        </div>
        {ref.campaignCloseTurn != null && (
          <p className="text-xs text-muted">
            {t("campaignVoteOnTurn", { turn: ref.campaignCloseTurn })}
            {turnsLeft != null &&
              turnsLeft > 0 &&
              ` ${t("campaignTurnsLeft", { turns: turnsLeft })}`}
          </p>
        )}
        {ref.kind !== "peace_agreement" && (
          <p className="text-xs text-muted">{t("campaignBaselineHelp")}</p>
        )}
      </div>
    </section>
  );
}
