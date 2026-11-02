"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useCurrency } from "@/contexts/CurrencyContext";
import { BLEND, FONT } from "@/components/blend/tokens";
import { readableInk } from "@/lib/elections/marginTierShade";
import { apiErrorText } from "@/lib/errors/catalog";
import { fetchJson } from "@/lib/observability/fetchJson";
import { partyLines, type CmCandidate, type CmRace } from "@/lib/campaignManager/rules";

/** What the simple-influence routes report for one viewer and one target. */
interface InfluenceInfo {
  canInfluence: boolean;
  myActions: number;
  myFunds: number;
  myHomeState: string;
  targetHomeState: string;
  targetInfluence: number;
  targetFavorability: number;
  attackFailureChance: number;
  targetMediaSustainedAtCap: boolean;
  supportFundsCostAnchor: number;
  supportActionCost: number;
  attackFundsCostAnchor: number;
  attackActionCost: number;
  barnstormFundsCostAnchor: number;
  barnstormActionCost: number;
}

type Action = "raise" | "lower" | "barnstorm";

/** Players act through their character route, NPPs through the NPP boost route. */
function influenceUrl(c: CmCandidate): string | null {
  if (c.isNPP) return c.nppDbId ? `/api/npps/${c.nppDbId}/boost` : null;
  return c.characterDbId ? `/api/characters/${c.characterDbId}/influence` : null;
}

/**
 * Boost, Attack and Barnstorm on any candidate in the race, priced and gated
 * exactly as the profile's Interact card: the same routes, the same costs and
 * the same caps.
 */
export function TargetPanel({
  race,
  candidate,
  onActed,
  onShowMyMoves,
}: {
  race: CmRace | null;
  candidate: CmCandidate | null;
  onActed: () => void;
  onShowMyMoves: () => void;
}) {
  const t = useTranslations("elections.campaignManager.target");
  const tr = useTranslations("elections.campaignManager.race");
  const ti = useTranslations("profile.interact");
  const { formatAmount } = useCurrency();
  const over = race?.stage === "final";
  const url = candidate && !candidate.isYou && !over ? influenceUrl(candidate) : null;
  const [info, setInfo] = useState<{ url: string; data: InfluenceInfo | null } | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [result, setResult] = useState<{ url: string; ok: boolean; msg: string } | null>(null);

  const load = useCallback(async (target: string) => {
    try {
      const data = await fetchJson<InfluenceInfo>(target, { feature: "campaign-manager-target" });
      setInfo({ url: target, data });
    } catch (err) {
      console.warn("Campaign Manager: target info unavailable", err);
      setInfo({ url: target, data: null });
    }
  }, []);

  useEffect(() => {
    if (!url) return;
    void load(url);
  }, [url, load]);

  if (!race || !candidate) {
    return <p style={{ margin: 0, fontSize: 13, color: BLEND.muted }}>{t("pick")}</p>;
  }
  if (over) {
    return <p style={{ margin: 0, fontSize: 13, color: BLEND.muted }}>{tr("over")}</p>;
  }

  const line = race.multiSeat
    ? partyLines(race).find((l) => l.partyId === candidate.partyId)
    : null;
  const poll = line ? line.share : candidate.share;
  const current = info && info.url === url ? info.data : undefined;
  const favorability = current?.targetFavorability ?? candidate.favorability;
  const influence = current?.targetInfluence ?? candidate.influence;

  const act = async (action: Action) => {
    if (!url || busy) return;
    setBusy(action);
    setResult(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ url, ok: !data.attackFailed, msg: data.message ?? "" });
        onActed();
        await load(url);
      } else {
        setResult({ url, ok: false, msg: apiErrorText(data, ti("actionFailed")) });
      }
    } catch {
      setResult({ url, ok: false, msg: ti("actionFailed") });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span
          aria-hidden="true"
          style={{
            flex: "none",
            width: 52,
            height: 52,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            fontSize: 17,
            fontWeight: 700,
            background: candidate.partyColor || BLEND.mutedDim,
            color: readableInk(candidate.partyColor || "#888888"),
          }}
        >
          {candidate.name
            .split(/\s+/)
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{candidate.name}</div>
          <div style={{ fontSize: 12.5, color: BLEND.muted }}>{candidate.partyName}</div>
        </div>
      </div>

      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {[
          [race.multiSeat ? t("partyPoll") : t("poll"), `${poll.toFixed(1)}%`],
          [t("favor"), `${Math.round(favorability)}%`],
          [t("influence"), `${Math.round(influence)}%`],
        ].map(([label, value]) => (
          <div
            key={label}
            style={{ padding: "8px 10px", background: BLEND.field, borderRadius: 8 }}
          >
            <dt style={{ fontSize: 11, color: BLEND.muted }}>{label}</dt>
            <dd style={{ margin: 0, fontFamily: FONT.mono, fontSize: 15, fontWeight: 600 }}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {candidate.isYou ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ margin: 0, fontSize: 13, color: BLEND.muted }}>{t("you")}</p>
          <button
            type="button"
            onClick={onShowMyMoves}
            style={{
              alignSelf: "flex-start",
              minHeight: 34,
              padding: "0 12px",
              borderRadius: 8,
              border: `1px solid ${BLEND.hairlineStrong}`,
              background: "transparent",
              color: BLEND.ink,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {t("openMyMoves")}
          </button>
        </div>
      ) : current === undefined ? (
        <p style={{ margin: 0, fontSize: 13, color: BLEND.muted }}>{t("working")}</p>
      ) : current === null ? (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: BLEND.negative }}>
          {ti("loadError")}
        </p>
      ) : (
        <TargetActions
          info={current}
          favorability={favorability}
          influence={influence}
          busy={busy}
          onAct={act}
          formatAmount={formatAmount}
        />
      )}

      {/* A result belongs to the candidate it was for; switching targets hides it. */}
      {result && result.url === url ? (
        <p
          role="status"
          style={{ margin: 0, fontSize: 12.5, color: result.ok ? BLEND.positive : BLEND.caution }}
        >
          {result.msg}
        </p>
      ) : null}
    </div>
  );
}

function TargetActions({
  info,
  favorability,
  influence,
  busy,
  onAct,
  formatAmount,
}: {
  info: InfluenceInfo;
  favorability: number;
  influence: number;
  busy: Action | null;
  onAct: (a: Action) => void;
  formatAmount: (n: number) => string;
}) {
  const t = useTranslations("elections.campaignManager.target");
  const ti = useTranslations("profile.interact");
  const favMaxed = favorability >= 100;
  const favFloored = favorability <= 0;
  const inflMaxed = influence >= 100;
  const afford = (ap: number, funds: number) => info.myActions >= ap && info.myFunds >= funds;
  const sameState = info.myHomeState === info.targetHomeState;

  const rows: Array<{
    action: Action;
    label: string;
    glyph: string;
    tone: string;
    ap: number;
    funds: number;
    note: string;
    enabled: boolean;
  }> = [
    {
      action: "raise",
      label: t("boost"),
      glyph: "+",
      tone: BLEND.positive,
      ap: info.supportActionCost,
      funds: info.supportFundsCostAnchor,
      note: favMaxed
        ? info.targetMediaSustainedAtCap
          ? ti("pinnedByMedia")
          : ti("maxed")
        : ti("plusFav"),
      enabled: !favMaxed && afford(info.supportActionCost, info.supportFundsCostAnchor),
    },
    {
      action: "lower",
      label: t("attack"),
      glyph: "×",
      tone: BLEND.negative,
      ap: info.attackActionCost,
      funds: info.attackFundsCostAnchor,
      note: favFloored
        ? ti("atFloor")
        : info.attackFailureChance > 0
          ? ti("attackEffectWithFail", { pct: Math.round(info.attackFailureChance) })
          : ti("attackEffect"),
      enabled: !favFloored && afford(info.attackActionCost, info.attackFundsCostAnchor),
    },
    {
      action: "barnstorm",
      label: t("barnstorm"),
      glyph: "↑",
      tone: BLEND.caution,
      ap: info.barnstormActionCost,
      funds: info.barnstormFundsCostAnchor,
      note: inflMaxed
        ? ti("influenceMaxed")
        : t("barnstormNote", { gain: sameState ? "+2%" : "+1%" }),
      enabled: !inflMaxed && afford(info.barnstormActionCost, info.barnstormFundsCostAnchor),
    },
  ];
  const anyAffordable = rows.some((r) => info.myActions >= r.ap);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r) => (
        <button
          key={r.action}
          type="button"
          disabled={!r.enabled || busy !== null}
          onClick={() => onAct(r.action)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minHeight: 56,
            padding: "8px 10px",
            borderRadius: 11,
            background: BLEND.field,
            border: `1px solid ${BLEND.hairlineStrong}`,
            color: BLEND.ink,
            textAlign: "left",
            cursor: r.enabled && busy === null ? "pointer" : "not-allowed",
            opacity: r.enabled ? 1 : 0.5,
            fontFamily: FONT.sans,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              flex: "none",
              width: 34,
              height: 34,
              borderRadius: 9,
              display: "grid",
              placeItems: "center",
              fontSize: 18,
              fontWeight: 700,
              color: r.tone,
              border: `1px solid ${r.tone}`,
            }}
          >
            {r.glyph}
          </span>
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              {busy === r.action ? t("working") : r.label}
            </span>
            <span style={{ fontSize: 12, color: BLEND.muted }}>{r.note}</span>
          </span>
          <span style={{ flex: "none", fontFamily: FONT.mono, fontSize: 11.5, color: BLEND.muted }}>
            {t("cost", { actions: r.ap, amount: formatAmount(r.funds) })}
          </span>
        </button>
      ))}
      <p
        style={{ margin: 0, fontSize: 12, color: anyAffordable ? BLEND.mutedDim : BLEND.negative }}
      >
        {anyAffordable
          ? t("resources", { actions: info.myActions, amount: formatAmount(info.myFunds) })
          : ti("notEnoughActions")}
      </p>
    </div>
  );
}
