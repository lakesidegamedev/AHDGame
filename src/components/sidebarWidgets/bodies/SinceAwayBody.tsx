"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { InboxCategory } from "@/lib/inbox/categories";
import type { HoldingMove, SinceAwayWidgetData } from "@/lib/sidebarWidgets/data/sinceAway";
import { percent, signedMoney, toneClass, WidgetEmpty } from "./common";

export function SinceAwayBody({
  data,
  onNavigate,
}: {
  data: SinceAwayWidgetData;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav.widgets.sinceAway");
  const categories: Record<InboxCategory, string> = {
    crisis: t("categories.crisis"),
    legislation: t("categories.legislation"),
    election: t("categories.election"),
    party: t("categories.party"),
    standing: t("categories.standing"),
    treasury: t("categories.treasury"),
    system: t("categories.system"),
  };
  const holdingLabel: Record<HoldingMove["kind"], string> = {
    stocks: t("stocks"),
    bonds: t("bonds"),
    funds: t("funds"),
  };
  const hasMoney = data.netWorthChangePct !== null;
  return (
    <div className="space-y-2">
      {hasMoney ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted">{t("netWorth")}</dt>
          <dd
            className={`text-right font-medium tabular-nums ${toneClass(data.netWorthChangePct)}`}
          >
            {data.netWorthChange !== null &&
              `${signedMoney(data.netWorthChange, data.currencyCode)} `}
            ({percent(data.netWorthChangePct ?? 0, true)})
          </dd>
          {data.cashChange !== null && (
            <>
              <dt className="text-muted">{t("cash")}</dt>
              <dd className={`text-right tabular-nums ${toneClass(data.cashChange)}`}>
                {signedMoney(data.cashChange, data.currencyCode)}
              </dd>
            </>
          )}
          {data.holdings.map((move) => (
            <div key={move.kind} className="contents">
              <dt className="text-muted">{holdingLabel[move.kind]}</dt>
              <dd className={`text-right tabular-nums ${toneClass(move.change)}`}>
                {percent(move.change, true)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <WidgetEmpty>{t("noHistory")}</WidgetEmpty>
      )}
      <div className="border-t border-card-border pt-2">
        {data.unreadTotal === 0 ? (
          <WidgetEmpty>{t("noUnread")}</WidgetEmpty>
        ) : (
          <Link
            href="/notifications"
            onClick={onNavigate}
            className="block rounded px-1 py-1 text-xs hover:bg-white/5"
          >
            <span className="font-semibold text-foreground">
              {t("unread", {
                count: data.unreadTotal,
                more: data.unreadCapped ? "+" : "",
              })}
            </span>
            <span className="mt-0.5 block text-muted">
              {data.unread.map((row) => `${categories[row.category]} ${row.count}`).join(" · ")}
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
