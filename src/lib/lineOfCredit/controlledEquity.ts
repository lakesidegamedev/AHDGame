/**
 * Credit collateral haircut for shares in a company the borrower controls
 * (gameConfig.equityCashoutLimitsStage). Borrowing against your own company's
 * quote, then buying its shares, raised the quote and with it the limit. While
 * the stage is on, those shares count toward the net-worth cap at the lower of
 * book per share and half the quote, and shares bought in the last 24 turns
 * while drawing credit count at zero.
 *
 * Purchase lots are not stored on the holding, so recent purchases come from
 * the share trade history: acquisitions of the controlled company in the last
 * 24 turns, counted only when the borrower drew on their line in that window.
 */
import type { Db } from "mongodb";
import type { Character, Corporation, ShareTradeHistory, ShareTradeKind } from "@/lib/db/types";
import type { LocLedgerEntry } from "@/lib/db/types/locLedger";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { getPublicShareQuote } from "@/lib/corporations/marketQuote";
import { resolveCorpLiquidCurrencyCode } from "@/lib/currency/corporationCapital";
import { loadCorpBookBasisById } from "@/lib/equities/cashoutLimits";
import {
  LEVERED_PURCHASE_LOOKBACK_TURNS,
  controlledHoldingCollateral,
  isControllingHolder,
} from "@/lib/equities/rules/cashoutLimits";
import { toInternalUnits } from "./locMath";

/** Trade kinds that put shares into the recipient's hands. */
const ACQUISITION_KINDS: ShareTradeKind[] = [
  "issuance",
  "market_buy",
  "limit_fill",
  "peer_fill",
  "listing_fill",
  "takeover_buyout",
];

export interface ControlledEquityHaircut {
  /** Value removed from gross assets for the net-worth cap (internal units). */
  haircutInternal: number;
  controlledCompanies: number;
  /** True when recent purchases were excluded because the borrower drew credit. */
  recentPurchasesExcluded: boolean;
}

const NO_HAIRCUT: ControlledEquityHaircut = {
  haircutInternal: 0,
  controlledCompanies: 0,
  recentPurchasesExcluded: false,
};

export async function computeControlledEquityHaircutInternal(
  db: Db,
  character: Pick<Character, "_id">,
  rates: Partial<Record<CurrencyCode, number>>,
  currentTurn: number
): Promise<ControlledEquityHaircut> {
  const charId = character._id;
  const corps = await db
    .collection<Corporation>("corporations")
    .find({ "shareholders.characterId": charId })
    .project<
      Pick<
        Corporation,
        | "_id"
        | "sharePrice"
        | "shareholders"
        | "countryId"
        | "liquidCurrencyCode"
        | "totalShares"
        | "ceoId"
        | "ceoVacant"
      >
    >({
      sharePrice: 1,
      shareholders: 1,
      countryId: 1,
      liquidCurrencyCode: 1,
      totalShares: 1,
      ceoId: 1,
      ceoVacant: 1,
    })
    .toArray();

  const controlled = corps
    .map((corp) => {
      // The first entry, exactly as the net-worth valuation reads it.
      const entry = (corp.shareholders ?? []).find((s) => s.characterId?.equals(charId));
      return { corp, shares: entry && entry.shares > 0 ? entry.shares : 0 };
    })
    .filter(
      ({ corp, shares }) =>
        shares > 0 &&
        isControllingHolder({
          isCeo: corp.ceoVacant !== true && !!corp.ceoId?.equals(charId),
          shares,
          totalShares: corp.totalShares ?? 0,
        })
    );
  if (controlled.length === 0) return NO_HAIRCUT;

  const ids = controlled.map(({ corp }) => corp._id);
  const lookbackStart = currentTurn - LEVERED_PURCHASE_LOOKBACK_TURNS;
  const [basisById, recentDraw] = await Promise.all([
    loadCorpBookBasisById(db, ids),
    db
      .collection<LocLedgerEntry>("locLedger")
      .findOne(
        { characterId: charId, type: "draw", turn: { $gt: lookbackStart } },
        { projection: { _id: 1 } }
      ),
  ]);
  const leveredByCorp = new Map<string, number>();
  if (recentDraw) {
    const rows = await db
      .collection<ShareTradeHistory>("shareTradeHistory")
      .find(
        {
          corporationId: { $in: ids },
          "to.characterId": charId,
          kind: { $in: ACQUISITION_KINDS },
          turn: { $gt: lookbackStart },
        },
        { projection: { corporationId: 1, shares: 1 } }
      )
      .toArray();
    for (const row of rows) {
      const key = row.corporationId.toString();
      leveredByCorp.set(key, (leveredByCorp.get(key) ?? 0) + Math.max(0, row.shares ?? 0));
    }
  }

  let haircutInternal = 0;
  for (const { corp, shares } of controlled) {
    const key = corp._id.toHexString();
    const quote = getPublicShareQuote(corp);
    const collateral = controlledHoldingCollateral({
      shares,
      quote,
      bookPerShare: basisById.get(key)?.bookPerShareLocal ?? 0,
      leveredShares: leveredByCorp.get(key) ?? 0,
    });
    const reduction = Math.max(0, shares * quote - collateral);
    const rate = rates[resolveCorpLiquidCurrencyCode(corp) ?? "USD"];
    if (rate && rate > 0) haircutInternal += toInternalUnits(reduction, rate);
  }
  return {
    haircutInternal,
    controlledCompanies: controlled.length,
    recentPurchasesExcluded: leveredByCorp.size > 0,
  };
}

/** Plain explanation shown beside the credit limit while the haircut applies. */
export function controlledEquityCollateralNote(
  haircut: ControlledEquityHaircut
): string | undefined {
  if (haircut.haircutInternal <= 0) return undefined;
  const base =
    "Shares in a company you run or hold more than 20% of count toward your limit at no more than half their price, and never more than the company's book value per share.";
  return haircut.recentPurchasesExcluded
    ? `${base} Shares of it you bought in the last ${LEVERED_PURCHASE_LOOKBACK_TURNS} turns while borrowing do not count.`
    : base;
}
