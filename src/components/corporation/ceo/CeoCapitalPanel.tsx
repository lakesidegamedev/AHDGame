"use client";

import { useState } from "react";
import Link from "next/link";
import { GameMonthTime } from "@/components/time/GameMonthTime";
import { Slider } from "@/components/ui";
import { MAX_DIVIDEND_RATE } from "@/lib/constants/corporations";
import { scaleMoney } from "@/lib/constants/moneyTimescale";
import type { CorporationDetail, Financials } from "../CorporationPageTypes";
import ShareIssuanceModal from "../shares/ShareIssuanceModal";
import {
  DenseSection,
  InlineStatus,
  KVList,
  KVRow,
  SmallButton,
  useCorpMoney,
} from "../dense/DenseKit";
import { CapitalInjectionPanel } from "./CapitalInjectionPanel";
import { ShareBuybackEscrowPanel } from "./ShareBuybackEscrowPanel";

const ISSUANCE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

interface CeoCapitalPanelProps {
  corpId: string;
  corporation: CorporationDetail;
  financials: Financials;
  currentTurn: number;
  myCashOnHand: number;
  myCurrencyBalances?: Partial<Record<string, number>>;
  onRefresh: () => void;
  editDividendRate: number;
  setEditDividendRate: (val: number) => void;
  dividendSaving: boolean;
  dividendError: string;
  dividendSuccess: string;
  onSaveDividend: () => void;
  editShareBuybackMode: "instant" | "escrow";
  setEditShareBuybackMode: (val: "instant" | "escrow") => void;
  editEscrowFundingPerTurn: string;
  setEditEscrowFundingPerTurn: (val: string) => void;
  saving: boolean;
  onSaveSettings: () => void;
}

/** Dividend policy, funding, buyback escrow and holdings: the CEO's money levers. */
export default function CeoCapitalPanel({
  corpId,
  corporation,
  financials,
  currentTurn,
  myCashOnHand,
  myCurrencyBalances,
  onRefresh,
  editDividendRate,
  setEditDividendRate,
  dividendSaving,
  dividendError,
  dividendSuccess,
  onSaveDividend,
  editShareBuybackMode,
  setEditShareBuybackMode,
  editEscrowFundingPerTurn,
  setEditEscrowFundingPerTurn,
  saving,
  onSaveSettings,
}: CeoCapitalPanelProps) {
  const money = useCorpMoney(corporation.liquidCurrencyCode, corporation.countryId);
  const [fundModal, setFundModal] = useState<{ cooldownRemaining: number } | null>(null);

  const isPublic = !corporation.isPrivate && !corporation.countryOwnerId;
  const savedRate = corporation.dividendRate ?? 0;
  // The payout the books will actually charge: legal-structure and parent
  // floors can force more than the CEO sets.
  const floorRate =
    financials.effectiveDividendRate > savedRate ? financials.effectiveDividendRate : null;
  const payoutRate = Math.max(editDividendRate, floorRate ?? 0);
  const payoutPerTurn =
    financials.income > 0
      ? Math.round(scaleMoney((financials.income * payoutRate) / 100, "turn"))
      : 0;

  function openFundCompany() {
    // Issuance cooldown mirrors useShareTrading: 24h after the last issuance.
    const remaining = corporation.lastShareIssuance
      ? Math.max(
          0,
          ISSUANCE_COOLDOWN_MS - (Date.now() - new Date(corporation.lastShareIssuance).getTime())
        )
      : 0;
    setFundModal({ cooldownRemaining: remaining });
  }

  return (
    <div className="space-y-6">
      <DenseSection id="ceo-dividend" title="Dividend">
        <div className="space-y-2 pt-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted">Payout of net income</span>
            <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
              {editDividendRate}%
            </span>
          </div>
          {/* The server accepts 0 to MAX_DIVIDEND_RATE; a legal or parent floor
              is marked on the track, since the books charge whichever is higher. */}
          <div className="relative pb-4">
            <Slider
              min={0}
              max={MAX_DIVIDEND_RATE}
              step={1}
              value={editDividendRate}
              onChange={(e) => setEditDividendRate(Number(e.target.value))}
              disabled={dividendSaving}
              aria-label="Dividend rate"
              className="w-full"
            />
            {floorRate != null && (
              <span
                data-legal-minimum
                aria-hidden
                className="absolute top-full -mt-4 flex -translate-x-1/2 flex-col items-center"
                style={{
                  left: `${(Math.min(floorRate, MAX_DIVIDEND_RATE) / MAX_DIVIDEND_RATE) * 100}%`,
                }}
              >
                <span className="h-2 w-px bg-warning" />
                <span className="text-[10px] tabular-nums text-warning">min {floorRate}%</span>
              </span>
            )}
            <span className="absolute bottom-0 left-0 text-[10px] tabular-nums text-muted">0%</span>
            <span className="absolute bottom-0 right-0 text-[10px] tabular-nums text-muted">
              {MAX_DIVIDEND_RATE}%
            </span>
          </div>
          <KVList>
            {floorRate != null && (
              <KVRow
                label="Legal minimum"
                value={`${floorRate}%`}
                title="The legal structure or a controlling parent sets a minimum payout. The books charge whichever is higher."
              />
            )}
            <KVRow
              label="Est. payout"
              value={money.fmt(payoutPerTurn)}
              hint="/turn"
              title="At the current projected net income."
            />
            {corporation.lastDividendChange && (
              <KVRow
                label="Last changed"
                value={<GameMonthTime value={corporation.lastDividendChange} />}
              />
            )}
          </KVList>
          <div className="flex items-center justify-end gap-2">
            <InlineStatus message={dividendError} tone="error" />
            <InlineStatus message={dividendSuccess} tone="success" />
            <SmallButton
              tone="primary"
              onClick={onSaveDividend}
              disabled={dividendSaving || editDividendRate === savedRate}
            >
              {dividendSaving ? "Saving" : "Update dividend"}
            </SmallButton>
          </div>
        </div>
      </DenseSection>

      <DenseSection title="Funding">
        {isPublic && (
          <div className="flex items-center justify-between gap-3 py-1">
            <p className="text-xs text-muted">
              Buy newly issued shares to move personal cash in. The company keeps the 15% premium.
            </p>
            <SmallButton onClick={openFundCompany}>Fund company</SmallButton>
          </div>
        )}
        {corporation.isPrivate && (
          <CapitalInjectionPanel corpId={corpId} corporation={corporation} onRefresh={onRefresh} />
        )}
        <div className="flex items-center justify-between gap-3 border-t border-card-border/60 py-1.5">
          <p className="text-xs text-muted">Stocks and bonds the corporation holds.</p>
          <Link
            href={`/portfolio?corp=${encodeURIComponent(corpId)}`}
            className="shrink-0 text-xs text-foreground underline decoration-card-border underline-offset-2 hover:decoration-foreground"
          >
            Open portfolio
          </Link>
        </div>
      </DenseSection>

      {isPublic && (
        <ShareBuybackEscrowPanel
          corpId={corpId}
          corporation={corporation}
          currentTurn={currentTurn}
          editShareBuybackMode={editShareBuybackMode}
          setEditShareBuybackMode={setEditShareBuybackMode}
          editEscrowFundingPerTurn={editEscrowFundingPerTurn}
          setEditEscrowFundingPerTurn={setEditEscrowFundingPerTurn}
          saving={saving}
          onSaveSettings={onSaveSettings}
          onRefresh={onRefresh}
        />
      )}

      {fundModal && (
        <ShareIssuanceModal
          corporation={corporation}
          corpId={corpId}
          myCashOnHand={myCashOnHand}
          myCurrencyBalances={myCurrencyBalances}
          issuanceOnCooldown={fundModal.cooldownRemaining > 0}
          issuanceCooldownRemaining={fundModal.cooldownRemaining}
          initialMode="ceo"
          onClose={() => setFundModal(null)}
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
}
