"use client";

import { ContractBoardLink } from "@/components/governmentContracts/ContractBoardLink";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { COMMODITY_LABELS } from "@/lib/constants/commodities";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useToast } from "@/contexts/ToastContext";
import { useGameTurnStatus } from "@/hooks/useGameEvents";
import {
  effectiveContractStatus,
  type ExtractionContractRow,
  type ExtractionContractStatus,
} from "@/components/extraction/types";
import { CONTRACT_DEFAULT_MISSED_PAYMENTS } from "@/lib/constants/prospecting";
import { DenseSection, SmallButton, TableScroll, Td, Th } from "./dense/DenseKit";
import { apiErrorText } from "@/lib/errors/catalog";
import { ProportionBar } from "./ledger/ProportionBar";

interface CorporationContractsTabProps {
  corpId: string;
  countryId?: string;
  isCeo: boolean;
}

/**
 * Extraction concessions, legacy offers and award history held by this corporation.
 * CEO can accept/decline offers and see royalty/term detail on active
 * contracts. Existing obligations remain visible when new issuance is paused.
 */
export default function CorporationContractsTab({
  corpId,
  isCeo,
  countryId,
}: CorporationContractsTabProps) {
  const t = useTranslations("corporations.extractionContracts");
  const { formatAmount } = useCurrency();
  const { showToast } = useToast();
  const gameTurn = useGameTurnStatus();
  const currentTurn = gameTurn?.currentTurn ?? 0;

  const [contracts, setContracts] = useState<ExtractionContractRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/contracts/extraction?corporationId=${corpId}&status=all`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(apiErrorText(data, t("loadFailed")));
        if (!controller.signal.aborted) setContracts(data.contracts ?? []);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : t("loadFailed"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [corpId, refreshKey, currentTurn, t]);

  async function respond(id: string, action: "accept" | "decline") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/contracts/extraction/${id}/${action}`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(apiErrorText(json, t("actionFailed")), "error");
        return;
      }
      showToast(action === "accept" ? t("accepted") : t("declined"), "success");
      setRefreshKey((k) => k + 1);
    } catch {
      showToast(t("networkError"), "error");
    } finally {
      setBusyId(null);
    }
  }

  const offers = contracts.filter((c) => effectiveContractStatus(c) === "offered");
  const active = contracts.filter((c) => effectiveContractStatus(c) === "active");
  const past = contracts.filter((c) => {
    const s = effectiveContractStatus(c);
    return s !== "offered" && s !== "active";
  });

  const resource = (c: ExtractionContractRow) => COMMODITY_LABELS[c.resource] ?? c.resource;
  // Share of the term already run, only when the contract says when it began
  // and how long it lasts; past expiry it reads full.
  const termUsed = (c: ExtractionContractRow) => {
    if (c.activatedTurn == null || c.termTurns == null || !(c.termTurns > 0)) return null;
    const used = Math.min(Math.max(currentTurn - c.activatedTurn, 0), c.termTurns);
    return { used, term: c.termTurns, pct: (used / c.termTurns) * 100 };
  };
  const royalty = (c: ExtractionContractRow) =>
    c.royaltyRatePerTurn != null ? `${(c.royaltyRatePerTurn * 100).toFixed(2)}%` : t("unavailable");

  return (
    <div className="space-y-6">
      <DenseSection title={t("heading")}>
        <p className="mb-3 text-sm text-muted">{t("intro")}</p>
        <ContractBoardLink
          countryId={countryId}
          type="extraction"
          corporationId={isCeo ? corpId : undefined}
        />
        <p className="mt-3 text-xs text-muted">{t("allocationHint")}</p>
        <p className="mt-2 text-xs text-muted">{t("royaltyHint")}</p>
      </DenseSection>
      {error ? (
        <div role="alert" className="rounded-lg border border-error/30 p-4">
          <p className="text-sm text-error">{error}</p>
          <SmallButton onClick={() => setRefreshKey((k) => k + 1)}>{t("retry")}</SmallButton>
        </div>
      ) : loading ? (
        <p role="status" className="text-sm text-muted">
          {t("loading")}
        </p>
      ) : contracts.length === 0 ? (
        <p className="text-sm text-muted">{t("empty")}</p>
      ) : null}
      {!error && !loading && offers.length > 0 && (
        <DenseSection title={t("pending")} meta={`${offers.length}`}>
          <TableScroll>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>{t("resource")}</Th>
                  <Th>{t("state")}</Th>
                  <Th align="right">{t("share")}</Th>
                  <Th align="right">{t("signingFee")}</Th>
                  <Th align="right" title={t("royaltyBasis")}>
                    {t("royalty")}
                  </Th>
                  <Th align="right">{t("term")}</Th>
                  <Th align="right">{t("offerExpires")}</Th>
                  {isCeo && (
                    <Th align="right">
                      <span className="sr-only">{t("respond")}</span>
                    </Th>
                  )}
                </tr>
              </thead>
              <tbody>
                {offers.map((c) => (
                  <tr key={c._id}>
                    <Td className="text-foreground">
                      {resource(c)}
                      {c.tenderId && (
                        <Link
                          className="mt-1 block text-xs text-primary"
                          href={`/country/${c.countryId.toLowerCase()}/government-contracts?tab=awarded&type=extraction&tender=${c.tenderId}`}
                        >
                          {t("awardRecord")}
                        </Link>
                      )}
                    </Td>
                    <Td className="text-muted">
                      <Link
                        href={`/country/${c.countryId.toLowerCase()}/region/${c.stateId}?tab=resources`}
                        className="text-primary"
                      >
                        {c.stateId}
                      </Link>
                    </Td>
                    <Td align="right">{(c.share * 100).toFixed(1)}%</Td>
                    <Td align="right">
                      {c.signingFeeAnchor != null
                        ? formatAmount(c.signingFeeAnchor)
                        : t("unavailable")}
                    </Td>
                    <Td align="right">{royalty(c)}</Td>
                    <Td align="right">
                      {c.termTurns ? t("turns", { count: c.termTurns }) : t("perpetual")}
                    </Td>
                    <Td align="right" className="text-muted">
                      {c.offerExpiresTurn != null
                        ? t("turns", { count: Math.max(0, c.offerExpiresTurn - currentTurn) })
                        : ""}
                    </Td>
                    {isCeo && (
                      <Td align="right" numeric={false}>
                        <span className="inline-flex gap-1.5">
                          <SmallButton
                            tone="primary"
                            onClick={() => void respond(c._id, "accept")}
                            disabled={busyId === c._id}
                          >
                            {busyId === c._id ? t("working") : t("accept")}
                          </SmallButton>
                          <SmallButton
                            onClick={() => void respond(c._id, "decline")}
                            disabled={busyId === c._id}
                          >
                            {t("decline")}
                          </SmallButton>
                        </span>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </DenseSection>
      )}

      {!error && !loading && active.length > 0 && (
        <DenseSection title={t("active")} meta={`${active.length}`}>
          <TableScroll>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>{t("resource")}</Th>
                  <Th>{t("state")}</Th>
                  <Th align="right">{t("share")}</Th>
                  <Th align="right">{t("royalty")}</Th>
                  <Th align="right">{t("expires")}</Th>
                  <Th align="right">{t("status")}</Th>
                </tr>
              </thead>
              <tbody>
                {active.map((c) => {
                  const missed = c.missedPayments ?? 0;
                  const term = termUsed(c);
                  return (
                    <tr key={c._id}>
                      <Td className="text-foreground">
                        {resource(c)}
                        {c.tenderId && (
                          <Link
                            className="mt-1 block text-xs text-primary"
                            href={`/country/${c.countryId.toLowerCase()}/government-contracts?tab=awarded&type=extraction&tender=${c.tenderId}`}
                          >
                            {t("awardRecord")}
                          </Link>
                        )}
                      </Td>
                      <Td className="text-muted">
                        <Link
                          href={`/country/${c.countryId.toLowerCase()}/region/${c.stateId}?tab=resources`}
                          className="text-primary"
                        >
                          {c.stateId}
                        </Link>
                      </Td>
                      <Td align="right">{(c.share * 100).toFixed(1)}%</Td>
                      <Td align="right">{royalty(c)}</Td>
                      <Td align="right" className="text-muted">
                        {c.expiresTurn != null
                          ? t("turn", { turn: c.expiresTurn })
                          : t("perpetual")}
                        {term && (
                          <span data-term-used className="mt-1 ml-auto block w-24">
                            <ProportionBar
                              pct={term.pct}
                              tone={term.used >= term.term ? "warning" : "info"}
                            />
                            <span className="mt-0.5 block text-[10px] text-muted">
                              {t("termUsed", { used: term.used, term: term.term })}
                            </span>
                          </span>
                        )}
                      </Td>
                      <Td align="right" numeric={false}>
                        {missed > 0 ? (
                          <span
                            className="text-warning"
                            title={t("defaultWarning", {
                              count: missed,
                              limit: CONTRACT_DEFAULT_MISSED_PAYMENTS,
                            })}
                          >
                            {t("missedPayments", { count: missed })}
                          </span>
                        ) : (
                          <ContractStatusText status="active" />
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        </DenseSection>
      )}

      {!error && !loading && past.length > 0 && (
        <DenseSection title={t("history")} meta={`${past.length}`}>
          <TableScroll>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>{t("resource")}</Th>
                  <Th>{t("state")}</Th>
                  <Th align="right">{t("share")}</Th>
                  <Th align="right">{t("status")}</Th>
                </tr>
              </thead>
              <tbody>
                {past.map((c) => (
                  <tr key={c._id}>
                    <Td className="text-foreground">
                      {resource(c)}
                      {c.tenderId && (
                        <Link
                          className="mt-1 block text-xs text-primary"
                          href={`/country/${c.countryId.toLowerCase()}/government-contracts?tab=awarded&type=extraction&tender=${c.tenderId}`}
                        >
                          {t("awardRecord")}
                        </Link>
                      )}
                    </Td>
                    <Td className="text-muted">
                      <Link
                        href={`/country/${c.countryId.toLowerCase()}/region/${c.stateId}?tab=resources`}
                        className="text-primary"
                      >
                        {c.stateId}
                      </Link>
                    </Td>
                    <Td align="right">{(c.share * 100).toFixed(1)}%</Td>
                    <Td align="right" numeric={false}>
                      <ContractStatusText status={effectiveContractStatus(c)} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </DenseSection>
      )}
    </div>
  );
}

const STATUS_TEXT: Record<ExtractionContractStatus, { label: string; tone: string }> = {
  revoked: { label: "revoked", tone: "text-muted" },
  offered: { label: "offered", tone: "text-foreground" },
  active: { label: "active", tone: "text-success" },
  declined: { label: "declined", tone: "text-muted" },
  expired: { label: "expired", tone: "text-muted" },
  defaulted: { label: "defaulted", tone: "text-error" },
};

/** Contract status as plain text, coloured by what it means. */
function ContractStatusText({ status }: { status: ExtractionContractStatus }) {
  const t = useTranslations("corporations.extractionContracts");
  const s = STATUS_TEXT[status];
  return <span className={s.tone}>{t(`statuses.${s.label}`)}</span>;
}
