import type { CorporationDetail, MarketOrder, MyShareOrder } from "../CorporationPageTypes";

export type PurchaseMode = "float" | "limit" | "orderbook" | "private" | "orders";
export type OrderSide = "buy" | "sell";

export const MAIN_MODES: { id: PurchaseMode; label: string }[] = [
  { id: "float", label: "At Market" },
  { id: "limit", label: "Limit Order" },
  { id: "orderbook", label: "Orderbook" },
  { id: "private", label: "Private Deal" },
];

/**
 * Modes the trade dialog offers.
 *
 * A private company's shares do not have a public order book: a resting order
 * there is visible to its holders but the private-sale band cannot match its
 * price, so the CEO could leave a bid nobody can fill (#4461). Private
 * companies trade through Private Deal only, and the server refuses order-book
 * orders for them.
 */
export function mainModesFor(isPrivate: boolean): { id: PurchaseMode; label: string }[] {
  if (!isPrivate) return MAIN_MODES;
  return MAIN_MODES.filter((mode) => mode.id === "float" || mode.id === "private");
}

export interface SharePurchaseModalProps {
  corporation: CorporationDetail;
  corpId: string;
  myCharacterId: string | null;
  myCashOnHand: number;
  myCurrencyBalances?: Partial<Record<string, number>>;
  myHomeCurrency?: string;
  autoConvertEnabled?: boolean;
  onAutoConvertChange?: (enabled: boolean) => void;
  myShares: number;
  myCorporation: {
    id: string;
    name: string;
    liquidCapital: number;
    liquidCurrencyCode?: string;
    isInvestmentBank?: boolean;
  } | null;
  myOrders: MyShareOrder[];
  marketOrders: MarketOrder[];
  onClose: () => void;
  onSuccess: () => void;
}
