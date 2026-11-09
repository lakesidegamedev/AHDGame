import type { ProducerEconomyAccount } from "@/lib/db/types/producerEconomy";
import { producerWalletId } from "@/lib/turn/corporation/producerWallets";
import { producerPayableId, type ProducerPayable } from "@/lib/market/producerMarket/payablesRules";
import type { CurrencyCode } from "@/lib/constants/currencies";

export interface WalletSuccessor {
  id: string;
  weight: number;
}

/** Existing cash is transferred, never reminted. Old zero wallets retain ledger identity. */
export function splitProducerWallets(
  sources: readonly ProducerEconomyAccount[],
  countryId: string,
  regions: readonly { _id: string; population: number }[]
) {
  const population = regions.reduce((sum, row) => sum + row.population, 0);
  if (
    !regions.length ||
    !Number.isFinite(population) ||
    population <= 0 ||
    regions.some((row) => !Number.isFinite(row.population) || row.population <= 0)
  )
    throw new Error("Invalid successor wallet population");
  const map: Record<string, WalletSuccessor[]> = {};
  const wallets: ProducerEconomyAccount[] = [];
  for (const source of sources) {
    if (
      !Number.isFinite(source.cash) ||
      source.cash < 0 ||
      !["households", "operatingPayee"].includes(source.kind)
    )
      throw new Error("Invalid regional producer wallet");
    let allocated = 0;
    map[source._id] = regions.map((region, i) => {
      const weight = region.population / population;
      const scope = {
        kind: source.kind,
        countryId,
        stateId: region._id,
        currency: source.currency as CurrencyCode,
      };
      const id = producerWalletId(source.worldEpoch, scope);
      const cash = i === regions.length - 1 ? source.cash - allocated : source.cash * weight;
      allocated += cash;
      wallets.push({
        _id: id,
        worldEpoch: source.worldEpoch,
        ...scope,
        cash,
        ...(source.openingFundingReceipt
          ? { openingFundingReceipt: source.openingFundingReceipt }
          : {}),
      });
      return { id, weight };
    });
  }
  return { map, wallets };
}

/** Outstanding invoices follow their payees and debtors, including invoices on foreign corporations. */
export function remapProducerPayables(
  claims: readonly ProducerPayable[],
  map: Record<string, WalletSuccessor[]>
): ProducerPayable[] {
  const result = new Map<string, ProducerPayable>();
  for (const claim of claims) {
    const debtors = map[claim.debtorAccountId] ?? [{ id: claim.debtorAccountId, weight: 1 }];
    const creditors = map[claim.creditorAccountId] ?? [{ id: claim.creditorAccountId, weight: 1 }];
    let allocated = 0;
    const pairs = debtors.flatMap((debtor) => creditors.map((creditor) => ({ debtor, creditor })));
    for (const [i, { debtor, creditor }] of pairs.entries()) {
      const amount =
        i === pairs.length - 1
          ? claim.amount - allocated
          : claim.amount * debtor.weight * creditor.weight;
      allocated += amount;
      const row = { ...claim, debtorAccountId: debtor.id, creditorAccountId: creditor.id, amount };
      row.id = producerPayableId(row);
      const previous = result.get(row.id);
      if (previous) previous.amount += row.amount;
      else result.set(row.id, row);
    }
  }
  return [...result.values()];
}
