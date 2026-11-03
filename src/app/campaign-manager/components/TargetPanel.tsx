"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useCurrency } from "@/contexts/CurrencyContext";
import { BLEND, FONT } from "@/components/blend/tokens";
import { readableInk } from "@/lib/elections/marginTierShade";
import { apiErrorText } from "@/lib/errors/catalog";
import { fetchJson } from "@/lib/observability/fetchJson";
import { partyLines, type CmCandidate, type CmRace } from "@/lib/campaignManager/rules";
import { EndorsementBadges } from "@/components/elections/EndorsementBadges";
import { EndorseControl } from "./EndorseControl";

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

/** One entry of the NPP profile's direct-action menu. */
interface NppMenuEntry {
  type: string;
  actionCost: number;
  /** Campaign funds in the player's home currency, as the profile shows them. */
  fundCost: number;
  effectBlurb: string;
  availabilityNote: string | null;
  enabled: boolean;
}

/** What the NPP direct-action route reports for one viewer and one NPP. */
interface NppMenu {
  balance: { current: number; funds: number };
  currencySymbol: string;
  actions: NppMenuEntry[];
}

type TargetInfo = { kind: "player"; data: InfluenceInfo } | { kind: "npp"; data: NppMenu };

type Action = "raise" | "lower" | "barnstorm";

/** The NPP profile's actions behind Boost, Attack and Barnstorm. */
const NPP_ACTION: Record<Action, string> = {
  raise: "boost_favorability",
  lower: "reduce_favorability",
  barnstorm: "boost_influence",
};

/**
 * Each target acts through the route its own profile uses: a player's
 * Interact card, or an NPP's direct-action panel.
 */
function targetRoute(c: CmCandidate): { url: string; kind: TargetInfo["kind"] } | null {
  if (c.isNPP)
    return c.nppDbId ? { url: `/api/npps/${c.nppDbId}/direct-action`, kind: "npp" } : null;
  return c.characterDbId
    ? { url: `/api/characters/${c.characterDbId}/influence`, kind: "player" }
    : null;
}

/**
 * Boost, Attack and Barnstorm on any candidate in the race, priced and gated
 * exactly as the target's profile: the same routes, the same costs and the
 * same caps.
 */
export function TargetPanel({
  race,
  candidate,
  onActed,
  onShowMyMoves,
  endorse,
}: {
  race: CmRace | null;
  candidate: CmCandidate | null;
  onActed: () => void;
  onShowMyMoves: () => void;
  /** A live general the player may endorse in: who they endorse now. */
  endorse?: { endorsedId: string | null; onChanged: () => void } | null;
}) {
  const t = useTranslations("elections.campaignManager.target");
  const tr = useTranslations("elections.campaignManager.race");
  const ti = useTranslations("profile.interact");
  const { formatAmount } = useCurrency();
  const over = race?.stage === "final";
  const route = candidate && !candidate.isYou && !over ? targetRoute(candidate) : null;
  const url = route?.url ?? null;
  const kind = route?.kind ?? null;
  const [info, setInfo] = useState<{ url: string; data: TargetInfo | null } | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [result, setResult] = useState<{ url: string; ok: boolean; msg: string } | null>(null);

  const load = useCallback(async (target: string, targetKind: TargetInfo["kind"]) => {
    try {
      const data = await fetchJson<InfluenceInfo & NppMenu>(target, {
        feature: "campaign-manager-target",
      });
      setInfo({ url: target, data: { kind: targetKind, data } });
    } catch (err) {
      console.warn("Campaign Manager: target info unavailable", err);
      setInfo({ url: target, data: null });
    }
  }, []);

  useEffect(() => {
    if (!url || !kind) return;
    void load(url, kind);
  }, [url, kind, load]);

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
  const player = current?.kind === "player" ? current.data : null;
  const favorability = player?.targetFavorability ?? candidate.favorability;
  const influence = player?.targetInfluence ?? candidate.influence;

  const act = async (action: Action) => {
    if (!url || !kind || busy) return;
    setBusy(action);
    setResult(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: kind === "npp" ? NPP_ACTION[action] : action }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ url, ok: !data.attackFailed, msg: data.message ?? data.effect ?? "" });
        onActed();
        await load(url, kind);
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
          <EndorsementBadges endorsements={candidate.endorsements} />
        </div>
      </div>

      {endorse && race.stage === "general" && !candidate.isYou ? (
        <EndorseControl
          electionId={race.electionId}
          candidateId={candidate.id}
          endorsedId={endorse.endorsedId}
          onChanged={endorse.onChanged}
        />
      ) : null}

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
      ) : current.kind === "player" ? (
        <PlayerActions
          info={current.data}
          favorability={favorability}
          influence={influence}
          busy={busy}
          onAct={act}
          formatAmount={formatAmount}
        />
      ) : (
        <NppActions menu={current.data} busy={busy} onAct={act} />
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

interface ActionRow {
  action: Action;
  ap: number;
  /** The funds cost, already formatted as the target's profile shows it. */
  amount: string;
  note: string;
  enabled: boolean;
}

/** A player target, priced by the Interact card's influence route (anchor units). */
function PlayerActions({
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

  const rows: ActionRow[] = [
    {
      action: "raise",
      ap: info.supportActionCost,
      amount: formatAmount(info.supportFundsCostAnchor),
      note: favMaxed
        ? info.targetMediaSustainedAtCap
          ? ti("pinnedByMedia")
          : ti("maxed")
        : ti("plusFav"),
      enabled: !favMaxed && afford(info.supportActionCost, info.supportFundsCostAnchor),
    },
    {
      action: "lower",
      ap: info.attackActionCost,
      amount: formatAmount(info.attackFundsCostAnchor),
      note: favFloored
        ? ti("atFloor")
        : info.attackFailureChance > 0
          ? ti("attackEffectWithFail", { pct: Math.round(info.attackFailureChance) })
          : ti("attackEffect"),
      enabled: !favFloored && afford(info.attackActionCost, info.attackFundsCostAnchor),
    },
    {
      action: "barnstorm",
      ap: info.barnstormActionCost,
      amount: formatAmount(info.barnstormFundsCostAnchor),
      note: inflMaxed
        ? ti("influenceMaxed")
        : t("barnstormNote", { gain: sameState ? "+2%" : "+1%" }),
      enabled: !inflMaxed && afford(info.barnstormActionCost, info.barnstormFundsCostAnchor),
    },
  ];
  return (
    <ActionRows
      rows={rows}
      myActions={info.myActions}
      myFunds={formatAmount(info.myFunds)}
      busy={busy}
      onAct={onAct}
    />
  );
}

/**
 * An NPP target, priced and gated by the NPP profile's direct-action menu. Its
 * amounts are in the player's home currency and shown the way that panel
 * shows them.
 */
function NppActions({
  menu,
  busy,
  onAct,
}: {
  menu: NppMenu;
  busy: Action | null;
  onAct: (a: Action) => void;
}) {
  const money = (n: number) => `${menu.currencySymbol}${n.toLocaleString("en-US")}`;
  const rows = (Object.keys(NPP_ACTION) as Action[]).flatMap((action): ActionRow[] => {
    const entry = menu.actions.find((a) => a.type === NPP_ACTION[action]);
    return entry
      ? [
          {
            action,
            ap: entry.actionCost,
            amount: money(entry.fundCost),
            note: entry.availabilityNote ?? entry.effectBlurb,
            enabled: entry.enabled,
          },
        ]
      : [];
  });
  return (
    <ActionRows
      rows={rows}
      myActions={menu.balance.current}
      myFunds={money(menu.balance.funds)}
      busy={busy}
      onAct={onAct}
    />
  );
}

const ROW_LOOK: Record<
  Action,
  { label: "boost" | "attack" | "barnstorm"; glyph: string; tone: string }
> = {
  raise: { label: "boost", glyph: "+", tone: BLEND.positive },
  lower: { label: "attack", glyph: "×", tone: BLEND.negative },
  barnstorm: { label: "barnstorm", glyph: "↑", tone: BLEND.caution },
};

function ActionRows({
  rows: priced,
  myActions,
  myFunds,
  busy,
  onAct,
}: {
  rows: ActionRow[];
  myActions: number;
  myFunds: string;
  busy: Action | null;
  onAct: (a: Action) => void;
}) {
  const t = useTranslations("elections.campaignManager.target");
  const ti = useTranslations("profile.interact");
  const rows = priced.map((r) => ({
    ...r,
    ...ROW_LOOK[r.action],
    label: t(ROW_LOOK[r.action].label),
  }));
  const anyAffordable = rows.some((r) => myActions >= r.ap);

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
            {t("cost", { actions: r.ap, amount: r.amount })}
          </span>
        </button>
      ))}
      <p
        style={{ margin: 0, fontSize: 12, color: anyAffordable ? BLEND.mutedDim : BLEND.negative }}
      >
        {anyAffordable
          ? t("resources", { actions: myActions, amount: myFunds })
          : ti("notEnoughActions")}
      </p>
    </div>
  );
}
