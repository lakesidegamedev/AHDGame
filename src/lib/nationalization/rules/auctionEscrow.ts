/** Escrow remains denominated in its original currency after a wallet moves. */
export function auctionEscrowRefundLocal(
  amount: number,
  sourceRate: number,
  targetRate: number
): number {
  if (![amount, sourceRate, targetRate].every((value) => Number.isFinite(value) && value > 0))
    throw new Error("Escrow refund exchange rate unavailable");
  const local = (amount / sourceRate) * targetRate;
  if (!Number.isFinite(local) || local <= 0) throw new Error("Invalid auction escrow refund");
  return local;
}
