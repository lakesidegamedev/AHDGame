"use client";

/**
 * Negotiated private share sale (suggestion 397).
 *
 * A seller names one buyer, a share count and the total price the two agreed,
 * with no 50%-200% band. The buyer pays it in one step and receives every
 * share. Pending and completed deals are shown to everyone on this company.
 */
import { useState } from "react";
import Link from "next/link";
import { PlayerSelector } from "@/components/PlayerSelector";
import { LocalTime } from "@/components/time/LocalTime";
import { apiErrorText } from "@/lib/errors/catalog";
import type { HoldingTerm } from "@/lib/corporations/rules/holdingTerms";

export interface NegotiatedTermsData {
  buyerCharacterId: string;
  buyerName: string;
  buyerSequentialId?: number;
  totalPrice: number;
  pricePerShare: number;
  marketPriceAtCreation: number;
  isForMe: boolean;
}

export interface NegotiatedListingData {
  _id: string;
  sellerName: string;
  sellerSequentialId?: number;
  sharesRemaining: number;
  expiresAt: string;
  isMySelling: boolean;
  negotiated: NegotiatedTermsData;
}

export interface NegotiatedDealData extends NegotiatedTermsData {
  _id: string;
  sellerName: string;
  sellerSequentialId?: number;
  shares: number;
  completedAt: string;
}

interface Money {
  /** Corp-local amount to a wallet-aware full figure. */
  fmtLocalFull: (local: number) => string;
  /** Corp-local price per share. */
  fmtLocalPrice: (local: number) => string;
  /** Display-currency input to corp-local. */
  inputToLocal: (display: number) => number;
  /** Corp-local to display-currency number, for input hints. */
  localToDisplay: (local: number) => number;
  inputSymbol: string;
}

interface NegotiatedSalePanelProps {
  corpId: string;
  corpName: string;
  /** Corp-local market price; 0 when redacted for this viewer. */
  sharePrice: number;
  myCharacterId: string | null;
  availableShares: number;
  holdingTerm: HoldingTerm;
  listings: NegotiatedListingData[];
  deals: NegotiatedDealData[];
  money: Money;
  onToast: (message: string, variant: "success" | "error") => void;
  onChanged: () => Promise<void>;
}

/** Agreed price relative to market, e.g. 3.45 for "3.45x market". */
export function premiumRatio(pricePerShare: number, marketPrice: number): number | null {
  if (!(marketPrice > 0) || !(pricePerShare > 0)) return null;
  return pricePerShare / marketPrice;
}

function RatioChip({ ratio }: { ratio: number | null }) {
  if (ratio === null) return null;
  const outsideBand = ratio > 2 || ratio < 0.5;
  const label =
    Math.abs(ratio - 1) < 0.005
      ? "at market"
      : `${ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(2)}x market`;
  return (
    <span
      className={`inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium tabular-nums ${
        outsideBand
          ? "border border-warning/40 bg-warning/10 text-warning"
          : "border border-card-border bg-card-elevated text-muted"
      }`}
      title={
        outsideBand ? "Outside the 50% to 200% range ordinary private offers allow" : undefined
      }
    >
      {label}
    </span>
  );
}

function PlayerName({ name, sequentialId }: { name: string; sequentialId?: number }) {
  return sequentialId ? (
    <Link
      href={`/character/${sequentialId}`}
      className="font-medium text-foreground hover:underline"
    >
      {name}
    </Link>
  ) : (
    <span className="font-medium text-foreground">{name}</span>
  );
}

const inputClass =
  "h-7 rounded-md border border-card-border bg-background px-2 text-right text-[13px] tabular-nums text-foreground focus:border-foreground focus:outline-none";
const primaryButton =
  "inline-flex h-7 items-center rounded-md border border-primary bg-primary px-2.5 text-xs font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50";

export default function NegotiatedSalePanel({
  corpId,
  corpName,
  sharePrice,
  myCharacterId,
  availableShares,
  holdingTerm,
  listings,
  deals,
  money,
  onToast,
  onChanged,
}: NegotiatedSalePanelProps) {
  const [composing, setComposing] = useState(false);
  const [buyer, setBuyer] = useState<{ id: string; name: string } | null>(null);
  const [shares, setShares] = useState(0);
  const [totalDisplay, setTotalDisplay] = useState(0);
  const [confirming, setConfirming] = useState<
    { kind: "propose" } | { kind: "pay"; listing: NegotiatedListingData } | null
  >(null);
  const [busy, setBusy] = useState(false);

  const totalLocal = totalDisplay > 0 ? money.inputToLocal(totalDisplay) : 0;
  const perShareLocal = shares > 0 && totalLocal > 0 ? totalLocal / shares : 0;
  const ratio = premiumRatio(perShareLocal, sharePrice);
  const canPropose = !!buyer && shares > 0 && shares <= availableShares && totalLocal > 0 && !busy;

  const forMe = listings.filter((l) => l.negotiated.isForMe);
  const mine = listings.filter((l) => l.isMySelling);
  const others = listings.filter((l) => !l.isMySelling && !l.negotiated.isForMe);

  const resetComposer = () => {
    setComposing(false);
    setBuyer(null);
    setShares(0);
    setTotalDisplay(0);
  };

  const propose = async () => {
    if (!buyer || !canPropose) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/corporations/${corpId}/shares/listings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shares,
          holdingTerm,
          negotiated: { buyerCharacterId: buyer.id, totalPrice: totalLocal },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast(apiErrorText(data, "Could not offer the negotiated sale"), "error");
        return;
      }
      onToast(`Offered ${shares.toLocaleString("en-US")} shares to ${buyer.name}`, "success");
      resetComposer();
      setConfirming(null);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const pay = async (listing: NegotiatedListingData) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/corporations/${corpId}/shares/listings/${listing._id}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shares: listing.sharesRemaining,
          pricePerShare: listing.negotiated.pricePerShare,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast(apiErrorText(data, "Payment did not go through"), "error");
        return;
      }
      onToast(
        `You bought ${listing.sharesRemaining.toLocaleString("en-US")} shares of ${corpName} for ${money.fmtLocalFull(listing.negotiated.totalPrice)}`,
        "success"
      );
      setConfirming(null);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (listingId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/corporations/${corpId}/shares/listings/${listingId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        onToast(apiErrorText(data, "Could not withdraw the sale"), "error");
        return;
      }
      onToast("Negotiated sale withdrawn and shares returned", "success");
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const terms = (t: NegotiatedTermsData, count: number) => (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {money.fmtLocalFull(t.totalPrice)}
      </span>
      <span>for {count.toLocaleString("en-US")} shares</span>
      <span>· {money.fmtLocalPrice(t.pricePerShare)} each</span>
      <RatioChip ratio={premiumRatio(t.pricePerShare, t.marketPriceAtCreation)} />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Incoming: the viewer is the named buyer */}
      {forMe.map((listing) => (
        <div
          key={listing._id}
          className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2"
        >
          <div className="text-xs text-muted">
            <PlayerName name={listing.sellerName} sequentialId={listing.sellerSequentialId} />{" "}
            offers you a negotiated sale
          </div>
          {terms(listing.negotiated, listing.sharesRemaining)}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-[11px] text-muted">
              Market value at listing{" "}
              <span className="tabular-nums text-foreground">
                {money.fmtLocalFull(
                  listing.negotiated.marketPriceAtCreation * listing.sharesRemaining
                )}
              </span>
              {" · "}Expires{" "}
              <LocalTime
                value={listing.expiresAt}
                options={{ hour: "2-digit", minute: "2-digit" }}
              />
            </span>
            <button
              type="button"
              onClick={() => setConfirming({ kind: "pay", listing })}
              disabled={busy}
              className={primaryButton}
            >
              Pay and take shares
            </button>
          </div>
        </div>
      ))}

      {/* Seller composer */}
      {myCharacterId && availableShares > 0 && (
        <div>
          {!composing ? (
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="inline-flex h-7 items-center rounded-md border border-card-border px-2.5 text-xs font-medium text-foreground hover:bg-card-elevated"
            >
              Sell to a specific player at an agreed price
            </button>
          ) : (
            <div className="rounded-lg border border-card-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-foreground">Negotiated sale</h3>
                <button
                  type="button"
                  onClick={resetComposer}
                  className="text-xs text-muted hover:text-foreground"
                >
                  Close
                </button>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Buyer</label>
                {buyer ? (
                  <div className="flex h-7 items-center gap-2 text-xs">
                    <span className="font-medium text-foreground">{buyer.name}</span>
                    <button
                      type="button"
                      onClick={() => setBuyer(null)}
                      className="text-muted hover:text-foreground"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <PlayerSelector
                    placeholder="Search by name or username..."
                    excludeIds={myCharacterId ? [myCharacterId] : []}
                    onSelect={(c) => setBuyer({ id: c.id, name: c.name })}
                  />
                )}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-muted mb-1">Shares</label>
                  <input
                    type="number"
                    value={shares || ""}
                    onChange={(e) =>
                      setShares(
                        Math.min(availableShares, Math.max(0, Math.floor(Number(e.target.value))))
                      )
                    }
                    placeholder={`Up to ${availableShares.toLocaleString("en-US")}`}
                    min={1}
                    max={availableShares}
                    className={`${inputClass} w-36`}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">
                    Agreed total ({money.inputSymbol})
                  </label>
                  <input
                    type="number"
                    value={totalDisplay || ""}
                    onChange={(e) => setTotalDisplay(Math.max(0, Number(e.target.value)))}
                    placeholder={
                      sharePrice > 0 && shares > 0
                        ? `Market ${Math.round(money.localToDisplay(sharePrice * shares)).toLocaleString("en-US")}`
                        : "Total price"
                    }
                    min={0}
                    step={1}
                    className={`${inputClass} w-44`}
                  />
                </div>
              </div>

              {shares > 0 && totalLocal > 0 && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-card-elevated px-3 py-2 text-xs sm:grid-cols-4">
                  <div>
                    <div className="text-muted">Per share</div>
                    <div className="tabular-nums text-foreground">
                      {money.fmtLocalPrice(perShareLocal)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted">Market value</div>
                    <div className="tabular-nums text-foreground">
                      {sharePrice > 0 ? money.fmtLocalFull(sharePrice * shares) : "Hidden"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted">Agreed</div>
                    <div className="tabular-nums font-medium text-foreground">
                      {money.fmtLocalFull(totalLocal)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted">Vs market</div>
                    <div>
                      <RatioChip ratio={ratio} />
                    </div>
                  </div>
                </div>
              )}

              <p className="text-[11px] leading-snug text-muted">
                The buyer pays the full amount in one payment and receives every share. Your shares
                are held until they pay, you withdraw, or 24 turns pass. Everyone can see the deal
                and its price on this company&apos;s Shares tab.
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setConfirming({ kind: "propose" })}
                  disabled={!canPropose}
                  className={primaryButton}
                >
                  {buyer ? `Offer to ${buyer.name}` : "Offer to buyer"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Seller's pending negotiated sales */}
      {mine.map((listing) => (
        <div key={listing._id} className="rounded-lg border border-card-border p-3 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs text-muted">
              Waiting for{" "}
              <PlayerName
                name={listing.negotiated.buyerName}
                sequentialId={listing.negotiated.buyerSequentialId}
              />{" "}
              to pay
            </div>
            <button
              type="button"
              onClick={() => void cancel(listing._id)}
              disabled={busy}
              className="text-xs text-error hover:text-error/80 disabled:opacity-50"
            >
              Withdraw
            </button>
          </div>
          {terms(listing.negotiated, listing.sharesRemaining)}
          <div className="text-[11px] text-muted">
            Expires{" "}
            <LocalTime value={listing.expiresAt} options={{ hour: "2-digit", minute: "2-digit" }} />
          </div>
        </div>
      ))}

      {/* Other players' pending negotiated sales, public */}
      {others.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-medium text-muted">Pending negotiated sales</h3>
          <div className="divide-y divide-card-border/60">
            {others.map((listing) => (
              <div key={listing._id} className="py-2 space-y-1">
                <div className="text-xs text-muted">
                  <PlayerName name={listing.sellerName} sequentialId={listing.sellerSequentialId} />{" "}
                  to{" "}
                  <PlayerName
                    name={listing.negotiated.buyerName}
                    sequentialId={listing.negotiated.buyerSequentialId}
                  />
                </div>
                {terms(listing.negotiated, listing.sharesRemaining)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Public record */}
      {deals.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-medium text-muted">Completed negotiated sales</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-card-border text-left text-muted">
                  <th className="py-1 pr-3 font-normal">Seller</th>
                  <th className="py-1 pr-3 font-normal">Buyer</th>
                  <th className="py-1 pr-3 text-right font-normal">Shares</th>
                  <th className="py-1 pr-3 text-right font-normal">Paid</th>
                  <th className="py-1 pr-3 font-normal">Vs market</th>
                  <th className="py-1 text-right font-normal">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border/50">
                {deals.map((deal) => (
                  <tr key={deal._id}>
                    <td className="py-1.5 pr-3">
                      <PlayerName name={deal.sellerName} sequentialId={deal.sellerSequentialId} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <PlayerName name={deal.buyerName} sequentialId={deal.buyerSequentialId} />
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">
                      {deal.shares.toLocaleString("en-US")}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">
                      {money.fmtLocalFull(deal.totalPrice)}
                    </td>
                    <td className="py-1.5 pr-3">
                      <RatioChip
                        ratio={premiumRatio(deal.pricePerShare, deal.marketPriceAtCreation)}
                      />
                    </td>
                    <td className="py-1.5 text-right text-muted">
                      <LocalTime
                        value={deal.completedAt}
                        options={{ month: "short", day: "numeric" }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-card-border bg-card p-5 shadow-modal space-y-3">
            {confirming.kind === "propose" && buyer ? (
              <>
                <h3 className="text-sm font-semibold text-foreground">Offer this sale?</h3>
                <p className="text-xs leading-relaxed text-muted">
                  {buyer.name} can buy {shares.toLocaleString("en-US")} shares of {corpName} from
                  you for{" "}
                  <span className="font-medium text-foreground">
                    {money.fmtLocalFull(totalLocal)}
                  </span>
                  . The shares are set aside now and the deal will be public.
                </p>
              </>
            ) : confirming.kind === "pay" ? (
              <>
                <h3 className="text-sm font-semibold text-foreground">Pay and take the shares?</h3>
                <p className="text-xs leading-relaxed text-muted">
                  You pay{" "}
                  <span className="font-medium text-foreground">
                    {money.fmtLocalFull(confirming.listing.negotiated.totalPrice)}
                  </span>{" "}
                  to {confirming.listing.sellerName} and receive{" "}
                  {confirming.listing.sharesRemaining.toLocaleString("en-US")} shares of {corpName}{" "}
                  straight away. This cannot be undone.
                </p>
              </>
            ) : null}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                disabled={busy}
                className="rounded-lg border border-card-border px-3 py-1.5 text-xs text-muted hover:bg-card-elevated disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  void (confirming.kind === "pay" ? pay(confirming.listing) : propose())
                }
                disabled={busy}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? "Working" : confirming.kind === "pay" ? "Pay now" : "Offer sale"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
