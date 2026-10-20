/** Producer-market wallet identities (households, public and construction buyers, operating payees). */
import { ZOD_CURRENCY_ENUM, type CurrencyCode } from "@/lib/constants/currencies";
import type { ProducerEconomyAccount } from "@/lib/db/types/producerEconomy";

export interface ProducerWalletScope {
  kind: ProducerEconomyAccount["kind"];
  countryId: string;
  stateId?: string;
  currency: CurrencyCode;
}

export function producerWalletId(worldEpoch: string, scope: ProducerWalletScope): string {
  if (
    !worldEpoch ||
    !scope.countryId ||
    !["households", "publicBuyer", "investmentBuyer", "operatingPayee"].includes(scope.kind) ||
    !ZOD_CURRENCY_ENUM.includes(scope.currency)
  )
    throw new Error("Invalid producer wallet scope");
  return JSON.stringify([
    worldEpoch,
    scope.kind,
    scope.countryId,
    scope.stateId ?? null,
    scope.currency,
  ]);
}
