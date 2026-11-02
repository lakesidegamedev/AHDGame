"use client";

import { useTranslations } from "next-intl";
import { BLEND, FONT } from "@/components/blend/tokens";
import ActionCardCompact from "@/app/actions/components/ActionCardCompact";
import { CampaignActionModal } from "@/app/actions/components/CampaignActionModal";
import { CATEGORY_LABELS } from "@/app/actions/actionsConstants";
import { actionCardProps } from "@/app/actions/actionCardProps";
import type { ActionsController } from "@/app/actions/useActionsController";
import { formatCurrencyFaceAmount } from "@/lib/currency/formatCurrencyFaceAmount";
import { getHomeCurrency } from "@/lib/currency/characterFunds";
import { myRaceSummary, partyLines, type CmRace } from "@/lib/campaignManager/rules";
import { EYEBROW } from "../ui";

const CATEGORY_ORDER = ["influence", "money", "research"] as const;

/**
 * My moves: the player's own stats, their race at a glance, and the Actions
 * page's cards, run through the same controller (same prices, same batching,
 * same pickers and modals).
 */
export function MyMovesPanel({
  controller,
  myRace,
  myRaceTitle,
  onOpenRace,
}: {
  controller: ActionsController;
  myRace: CmRace | undefined;
  myRaceTitle: string | null;
  onOpenRace: () => void;
}) {
  const t = useTranslations("elections.campaignManager.myMoves");
  const character = controller.character;

  if (!controller.ready || !character) {
    return <p style={{ margin: 0, fontSize: 13, color: BLEND.muted }}>{t("loading")}</p>;
  }

  const infamy = character.infamy ?? 0;
  const stats = [
    {
      label: t("influence"),
      value: `${Math.round(character.politicalInfluence ?? 0)}%`,
      title: t("influenceTitle"),
      color: BLEND.ink,
    },
    {
      label: t("favor"),
      value: `${Math.round(character.favorability ?? 0)}%`,
      title: t("favorTitle"),
      color: BLEND.ink,
    },
    {
      label: t("infamy"),
      value: String(Math.round(infamy)),
      title: t("infamyTitle"),
      color: infamy > 20 ? BLEND.negative : infamy > 12 ? BLEND.caution : BLEND.ink,
    },
    {
      label: t("donors"),
      value: t("donorLevel", { n: character.donorBaseLevel ?? 0 }),
      title: t("donorsTitle"),
      color: BLEND.ink,
    },
    {
      label: t("debate"),
      value: String(character.stats?.debate ?? 0),
      title: t("debateTitle"),
      color: BLEND.ink,
    },
  ];

  const summary = myRaceSummary(myRace);
  const myParty = myRace?.candidates.find((c) => c.isYou)?.partyId;
  const abbr =
    myRace && myParty
      ? partyLines(myRace).find((l) => l.partyId === myParty)?.partyAbbr
      : undefined;
  const standing = summary
    ? summary.leading
      ? t("leads", { gap: summary.gap.toFixed(1) })
      : t("trails", { gap: summary.gap.toFixed(1) })
    : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <dl
        aria-label={t("statsLabel")}
        style={{
          margin: 0,
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0,1fr))",
          gap: 6,
        }}
      >
        {stats.map((s) => (
          <div
            key={s.label}
            title={s.title}
            style={{
              padding: "7px 6px",
              background: BLEND.field,
              borderRadius: 8,
              textAlign: "center",
            }}
          >
            <dt style={{ fontSize: 10.5, color: BLEND.muted }}>{s.label}</dt>
            <dd
              style={{
                margin: 0,
                fontFamily: FONT.mono,
                fontSize: 14,
                fontWeight: 600,
                color: s.color,
              }}
            >
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
      <p style={{ margin: 0, fontFamily: FONT.mono, fontSize: 12, color: BLEND.muted }}>
        {t("resources", {
          actions: character.actions ?? 0,
          funds: formatCurrencyFaceAmount(
            controller.displayCampaignFundsStored,
            getHomeCurrency(character)
          ),
        })}
      </p>

      {summary && myRaceTitle ? (
        <section
          style={{
            padding: "10px 12px",
            border: `1px solid ${BLEND.hairlineStrong}`,
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <span style={EYEBROW}>{t("yourRace")}</span>
          <button
            type="button"
            onClick={onOpenRace}
            aria-label={`${t("openRace")}: ${myRaceTitle}`}
            style={{
              textAlign: "left",
              background: "transparent",
              border: 0,
              padding: 0,
              color: BLEND.ink,
              cursor: "pointer",
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            {myRaceTitle}
          </button>
          <span style={{ fontFamily: FONT.mono, fontSize: 12.5 }}>
            {myRace?.multiSeat && abbr
              ? t("summaryParty", {
                  abbr,
                  position: summary.position,
                  share: `${summary.share.toFixed(1)}%`,
                  standing,
                })
              : t("summary", {
                  position: summary.position,
                  share: `${summary.share.toFixed(1)}%`,
                  standing,
                })}
          </span>
          {summary.partySeats != null && summary.totalSeats ? (
            <span style={{ fontSize: 12, color: BLEND.muted }}>
              {t("seats", { seats: summary.partySeats, total: summary.totalSeats })}
            </span>
          ) : null}
        </section>
      ) : (
        <p style={{ margin: 0, fontSize: 12.5, color: BLEND.muted }}>{t("noRace")}</p>
      )}

      {CATEGORY_ORDER.map((category) => {
        const cards = controller.cards.filter((c) => c.category === category);
        if (cards.length === 0) return null;
        return (
          <section key={category} aria-labelledby={`cm-actions-${category}`}>
            <h3 id={`cm-actions-${category}`} style={{ ...EYEBROW, margin: "0 0 6px" }}>
              {CATEGORY_LABELS[category] ?? category}
            </h3>
            <div
              style={{
                border: `1px solid ${BLEND.hairline}`,
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              {cards.map((card, i) => (
                <ActionCardCompact
                  key={card.type}
                  {...actionCardProps(controller, card, i, "compact")}
                />
              ))}
            </div>
          </section>
        );
      })}

      <CampaignActionModal
        action={controller.campaignAction}
        character={character}
        onClose={() => controller.setCampaignAction(null)}
        onResourcesSpent={controller.fetchCharacter}
      />
    </div>
  );
}
