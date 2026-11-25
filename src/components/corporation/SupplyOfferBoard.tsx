"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  COMMODITY_TYPES,
  COMMODITY_LABELS,
  COMMODITY_UNITS,
  type CommodityType,
} from "@/lib/constants/commodities";
import { supplyAgreementRequiresState } from "@/lib/market/commodityMarketScope";
import {
  SUPPLY_AGREEMENT_PRICE_BAND,
  SUPPLY_AGREEMENT_DURATION_MIN_TURNS,
  SUPPLY_AGREEMENT_DURATION_MAX_TURNS,
} from "@/lib/db/types/supplyAgreement";
import type { SupplyListingView } from "@/lib/db/types/supplyListing";
import { apiErrorText } from "@/lib/errors/catalog";
import { ComputerRunOfferNote } from "@/components/market/supplyOfferUi";

export function SupplyOfferBoard({
  corpId,
  onRespond,
}: {
  corpId: string;
  onRespond: (listing: SupplyListingView) => void;
}) {
  const t = useTranslations("corporations.supplyBoard");
  const [listings, setListings] = useState<SupplyListingView[]>([]);
  const [own, setOwn] = useState<SupplyListingView[]>([]);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(false);
  const [side, setSide] = useState<"buy" | "sell">("sell");
  const [commodity, setCommodity] = useState<CommodityType>("energy");
  const [stateId, setStateId] = useState("");
  const [volume, setVolume] = useState("");
  const [premium, setPremium] = useState(0);
  const [duration, setDuration] = useState("");
  const [revision, setRevision] = useState(0);
  const [takeVolumes, setTakeVolumes] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState("");
  const [dailyUse, setDailyUse] = useState<Partial<Record<string, number>>>({});
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/corporations/${corpId}/commodities`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) return;
        const data = (await r.json()) as {
          commodities?: Array<{ commodity: string; consumptionUnits: number }>;
        };
        if (controller.signal.aborted || !Array.isArray(data.commodities)) return;
        setDailyUse(
          Object.fromEntries(data.commodities.map((c) => [c.commodity, c.consumptionUnits]))
        );
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [corpId, revision]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const query = new URLSearchParams({
      page: String(page),
      ...(filter ? { commodity: filter } : {}),
    });
    void fetch(`/api/corporations/${corpId}/supply-listings?${query}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(apiErrorText(data, t("failed")));
        if (!controller.signal.aborted) {
          setListings(data.listings);
          setOwn(data.ownListings);
          setHasMore(data.hasMore);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : t("failed"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [corpId, filter, page, revision, t]);
  const mutate = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError("");
      try {
        const response = await fetch(`/api/corporations/${corpId}/supply-listings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(apiErrorText(data, t("failed")));
        setRevision((n) => n + 1);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : t("failed"));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [corpId, t]
  );
  async function take(row: SupplyListingView) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/corporations/${corpId}/supply-listings/take`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: row.id,
          volume: Number(takeVolumes[row.id] ?? row.volumeCap),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(apiErrorText(data, t("failed")));
      setNotice(t("taken"));
      setConfirming("");
      setRevision((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }
  async function publish(e: FormEvent) {
    e.preventDefault();
    const slot = Array.from({ length: 10 }, (_, i) => i).find(
      (i) => !own.some((row) => row.slot === i)
    );
    if (slot === undefined) {
      setError(t("full"));
      return;
    }
    if (
      await mutate({
        action: "publish",
        slot,
        side,
        commodity,
        ...(supplyAgreementRequiresState(commodity) ? { stateId } : {}),
        volumeCap: Number(volume),
        pricePremium: premium / 100,
        ...(duration ? { durationTurns: Number(duration) } : {}),
        validForTurns: 168,
      })
    ) {
      setForm(false);
      setVolume("");
    }
  }
  const sizeNote = (row: SupplyListingView): string | null => {
    const use = dailyUse[row.commodity];
    if (row.own || row.side !== "sell" || !use || use <= 0) return null;
    const ratio = Math.round((row.volumeCap / use) * 10) / 10;
    return ratio > 1 ? t("sizeNote", { ratio }) : null;
  };
  const isUsable = (row: SupplyListingView) => row.own || !row.unreachableReason;
  const usable = listings.filter(isUsable);
  const unusable = listings.filter((row) => !isUsable(row));
  const renderCard = (row: SupplyListingView) => (
    <article key={row.id} className="space-y-2 border-b border-card-border/60 py-2">
      <h4 className="font-medium">
        {t(row.side)}: {COMMODITY_LABELS[row.commodity]}
      </h4>
      <p className="text-body">
        {row.corporationName}
        {row.ai ? ` (${t("npp")})` : ""}
        {row.stateId ? ` (${row.stateId})` : ""}
      </p>
      {row.corporationCountryId && (
        <p className="text-body-sm text-muted">
          {row.creditRating
            ? t("seller", {
                country: row.corporationCountryId,
                rating: row.creditRating,
              })
            : t("sellerCountry", { country: row.corporationCountryId })}
        </p>
      )}
      <p className="text-body-sm">
        {t("terms", {
          volume: row.volumeCap.toLocaleString(),
          unit: COMMODITY_UNITS[row.commodity],
          premium: Math.round(row.pricePremium * 100),
        })}
      </p>
      {row.ai && row.sizingBasis && (
        <p className="text-body-sm text-muted" data-testid="offer-sizing-basis">
          {t(row.sizingBasis === "unmetOutput" ? "sizingUnmetOutput" : "sizingSpareCapacity")}
        </p>
      )}
      {sizeNote(row) && <p className="text-body-sm text-warning">{sizeNote(row)}</p>}
      <p className="text-body-sm text-muted">
        {row.durationTurns ? t("term", { count: row.durationTurns }) : t("openEnded")} ·{" "}
        {t("expires", { turn: row.expiresAtTurn })}
      </p>
      {!row.own && row.unreachableReason && (
        <p className="text-body-sm text-warning" role="note">
          {row.unreachableReason}
        </p>
      )}
      {!row.own && !row.unreachableReason && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-body-sm">
            {t("takeVolume")}
            <input
              className={`${control} w-28`}
              type="number"
              min="0.000001"
              max={row.volumeCap}
              step="any"
              value={takeVolumes[row.id] ?? String(row.volumeCap)}
              onChange={(e) => setTakeVolumes((prev) => ({ ...prev, [row.id]: e.target.value }))}
              disabled={busy}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(row.id)}
            className="inline-flex h-7 items-center rounded-md border border-primary bg-primary px-2.5 text-body-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:bg-card-border disabled:text-muted disabled:hover:bg-card-border"
          >
            {busy ? t("taking") : t("take")}
          </button>
          <button
            type="button"
            onClick={() => onRespond(row)}
            className="inline-flex h-7 items-center rounded-md border border-card-border px-2.5 text-body-sm font-medium text-foreground hover:bg-card-elevated"
          >
            {t("negotiate")}
          </button>
        </div>
      )}
      {confirming === row.id && !row.own && !row.unreachableReason && (
        <div className="space-y-2 rounded-md border border-warning/60 p-2" role="group">
          <p className="text-body-sm font-medium">{t("confirmTitle")}</p>
          <p className="text-body-sm">
            {t(row.side === "sell" ? "confirmBuy" : "confirmSell", {
              volume: Number(takeVolumes[row.id] ?? row.volumeCap).toLocaleString(),
              unit: COMMODITY_UNITS[row.commodity],
              company: row.corporationName,
              term: row.durationTurns ? t("term", { count: row.durationTurns }) : t("openEnded"),
            })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void take(row)}
              className="inline-flex h-7 items-center rounded-md border border-primary bg-primary px-2.5 text-body-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:bg-card-border disabled:text-muted disabled:hover:bg-card-border"
            >
              {busy ? t("taking") : t("confirm")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming("")}
              className="inline-flex h-7 items-center rounded-md border border-card-border px-2.5 text-body-sm text-foreground hover:bg-card-elevated"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </article>
  );
  const control =
    "h-8 w-full rounded-md border border-card-border bg-background px-2 text-body-sm text-foreground focus:border-foreground focus:outline-none";
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-body-lg font-semibold text-foreground">{t("title")}</h3>
          <p className="mt-1 max-w-2xl text-body-sm text-muted">{t("intro")}</p>
          {[...listings, ...own].some((row) => row.ai) && <ComputerRunOfferNote />}
        </div>
        <button
          type="button"
          disabled={loading || busy || !!error || own.length >= 10}
          onClick={() => setForm((v) => !v)}
          className="inline-flex h-7 items-center rounded-md border border-card-border px-2.5 text-body-sm font-medium text-foreground hover:bg-card-elevated disabled:opacity-50"
        >
          {t(form ? "close" : "publish")}
        </button>
      </div>
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => setRevision((n) => n + 1)}>
            {t("retry")}
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {form && (
        <form onSubmit={(e) => void publish(e)} className="grid gap-3 sm:grid-cols-2">
          <label className="text-body-sm">
            {t("side")}
            <select
              className={control}
              value={side}
              onChange={(e) => setSide(e.target.value as "buy" | "sell")}
              disabled={busy}
            >
              <option value="sell">{t("sell")}</option>
              <option value="buy">{t("buy")}</option>
            </select>
          </label>
          <label className="text-body-sm">
            {t("commodity")}
            <select
              className={control}
              value={commodity}
              onChange={(e) => {
                setCommodity(e.target.value as CommodityType);
                setStateId("");
              }}
              disabled={busy}
            >
              {COMMODITY_TYPES.map((c) => (
                <option key={c} value={c}>
                  {COMMODITY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          {supplyAgreementRequiresState(commodity) && (
            <label className="text-body-sm">
              {t("state")}
              <input
                required
                className={control}
                value={stateId}
                maxLength={32}
                onChange={(e) => setStateId(e.target.value.toUpperCase())}
                disabled={busy}
              />
            </label>
          )}
          <label className="text-body-sm">
            {t("volume", { unit: COMMODITY_UNITS[commodity] })}
            <input
              required
              className={control}
              type="number"
              min="0.000001"
              step="any"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="text-body-sm">
            {t("premium")}
            <input
              required
              className={control}
              type="number"
              min={-SUPPLY_AGREEMENT_PRICE_BAND * 100}
              max={SUPPLY_AGREEMENT_PRICE_BAND * 100}
              step="any"
              value={premium}
              onChange={(e) => setPremium(Number(e.target.value))}
              disabled={busy}
            />
          </label>
          <label className="text-body-sm">
            {t("duration")}
            <input
              className={control}
              type="number"
              min={SUPPLY_AGREEMENT_DURATION_MIN_TURNS}
              max={SUPPLY_AGREEMENT_DURATION_MAX_TURNS}
              value={duration}
              placeholder={t("openEnded")}
              onChange={(e) => setDuration(e.target.value)}
              disabled={busy}
            />
          </label>
          <p className="text-body-sm text-muted sm:col-span-2">{t("expiry")}</p>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-7 items-center rounded-md border border-primary bg-primary px-2.5 text-body-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:bg-card-border disabled:text-muted disabled:hover:bg-card-border"
          >
            {t("submit")}
          </button>
        </form>
      )}
      {own.length > 0 && (
        <details>
          <summary className="cursor-pointer text-body">{t("own", { count: own.length })}</summary>
          <ul className="mt-2 space-y-2">
            {own.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 text-body"
              >
                <span>
                  {t(row.side)} {COMMODITY_LABELS[row.commodity]} {row.stateId ?? ""}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void mutate({ action: "withdraw", slot: row.slot })}
                  className="inline-flex h-7 items-center rounded-md border border-card-border px-2.5 text-body-sm text-foreground hover:bg-card-elevated"
                >
                  {t("withdraw")}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <label className="block text-body-sm">
        {t("filter")}
        <select
          className={control}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="">{t("all")}</option>
          {COMMODITY_TYPES.map((c) => (
            <option key={c} value={c}>
              {COMMODITY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      {loading ? (
        <p role="status">{t("loading")}</p>
      ) : (
        !error && (
          <>
            {listings.length === 0 && <p className="py-1 text-body-sm text-muted">{t("empty")}</p>}
            <div className="grid gap-3 md:grid-cols-2">{usable.map(renderCard)}</div>
            {unusable.length > 0 && (
              <details className="rounded-md border border-card-border/60 p-2">
                <summary className="cursor-pointer text-body">
                  {t("cannotUse", { count: unusable.length })}
                </summary>
                <p className="mt-1 text-body-sm text-muted">{t("cannotUseHint")}</p>
                <div className="mt-2 grid gap-3 md:grid-cols-2">{unusable.map(renderCard)}</div>
              </details>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((n) => n - 1)}
                className="text-body-sm text-foreground underline decoration-card-border underline-offset-2 hover:decoration-foreground disabled:opacity-40 disabled:no-underline"
              >
                {t("previous")}
              </button>
              <button
                type="button"
                disabled={!hasMore || page >= 100}
                onClick={() => setPage((n) => n + 1)}
                className="text-body-sm text-foreground underline decoration-card-border underline-offset-2 hover:decoration-foreground disabled:opacity-40 disabled:no-underline"
              >
                {t("next")}
              </button>
            </div>
          </>
        )
      )}
    </section>
  );
}
