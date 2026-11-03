"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { BLEND } from "@/components/blend/tokens";
import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";
import { ELECTION_DAY_TURNS } from "@/lib/electionEngine/voteCalculations";
import type { CmStage } from "@/lib/campaignManager/rules";

// The statutory map reads the 72 KB 1994 constituency table, so it loads only
// for a Japanese mixed-chamber race, after the panel paints.
const JpStatutoryConstituencyList = dynamic(
  () =>
    import("@/components/elections/JpStatutoryConstituencyList").then(
      (m) => m.JpStatutoryConstituencyList
    ),
  { loading: () => null }
);

type NotesRace = Pick<
  ElectionResponse,
  "state" | "hungarianModernByElection" | "japanShugiinRules"
>;

/**
 * Short notes a race needs read before acting, as the election page showed
 * them: campaign season in a general's closing turns, a Hungarian by-election's
 * district, and Japan's 1994 mixed chamber with its statutory constituency map.
 */
export function RaceNotes({
  election,
  stage,
  turnsLeft,
}: {
  election: NotesRace;
  stage: CmStage;
  turnsLeft: number | null;
}) {
  const t = useTranslations("elections");
  const season =
    stage === "general" && turnsLeft != null && turnsLeft > 0 && turnsLeft <= ELECTION_DAY_TURNS;
  const byElection = election.hungarianModernByElection;
  const jp =
    election.japanShugiinRules?.ruleVersion === "mixed-1994-v1" ? election.japanShugiinRules : null;
  if (!season && !byElection && !jp) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
      {season ? (
        <p
          role="status"
          style={{
            margin: 0,
            padding: "8px 10px",
            borderRadius: 8,
            border: `1px solid ${BLEND.caution}`,
            color: BLEND.ink,
          }}
        >
          {t("campaignManager.race.campaignSeason", { n: turnsLeft })}
        </p>
      ) : null}
      {byElection ? (
        <p style={{ margin: 0, color: BLEND.muted }}>
          {t("huModernByElection.description", { district: byElection.districtId })}
        </p>
      ) : null}
      {jp ? (
        <div style={{ color: BLEND.muted }}>
          <p style={{ margin: 0 }}>
            {t("campaignManager.race.jpMixed", {
              districtSeats: jp.districtSeats,
              listSeats: jp.listSeats,
            })}
          </p>
          <details style={{ marginTop: 4 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>
              {t("campaignManager.race.jpMap")}
            </summary>
            <JpStatutoryConstituencyList regionId={election.state} />
          </details>
        </div>
      ) : null}
    </div>
  );
}
