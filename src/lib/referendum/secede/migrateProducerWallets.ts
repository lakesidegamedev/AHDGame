import type { Db } from "mongodb";
import type { ProducerEconomyAccount } from "@/lib/db/types/producerEconomy";
import type { ExchangeRate } from "@/lib/db/types/exchangeRate";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { accountId } from "@/lib/ledger/accounts";
import { emitLedgerEntries } from "@/lib/ledger/emit";
import type { LedgerEntryInput } from "@/lib/ledger/types";
import { splitProducerWallets, remapProducerPayables } from "./rules/producerWallets";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { exchangeRatesCollection } from "@/lib/db/repositories/exchangeRates";

/** Called inside the enclosing independence transaction, before the old region is removed. */
export async function migrateProducerWallets(
  db: Db,
  countryId: string,
  regions: readonly { _id: string; population: number }[],
  turn: number
): Promise<void> {
  const accounts = db.collection<ProducerEconomyAccount>("producerEconomyAccounts");
  const source = await accounts.find({ countryId: "UK", stateId: countryId }).toArray();
  if (!source.length) return;
  const { map, wallets } = splitProducerWallets(source, countryId, regions);
  const oldIds = source.map((row) => row._id);
  const targetIds = wallets.map((row) => row._id);
  if (await accounts.findOne({ _id: { $in: targetIds } }))
    throw new Error("Successor producer wallet already exists before independence");
  const affected = {
    $or: [
      { "producerPayables.claims.creditorAccountId": { $in: oldIds } },
      { "producerPayables.claims.debtorAccountId": { $in: oldIds } },
    ],
  };
  const projection = {
    producerPayables: 1,
    pendingMoneyMoveReceipt: 1,
    pendingSettlementProjection: 1,
  };
  const [corporations, otherWallets] = await Promise.all([
    corporationsCollection(db).find(affected, { projection }).toArray(),
    accounts.find(affected).toArray(),
  ]);
  const originals = new Map([...source, ...otherWallets].map((row) => [row._id, row]));
  for (const row of [...originals.values(), ...corporations]) {
    const pending = row as unknown as Record<string, unknown>;
    if (pending.pendingMoneyMoveReceipt || pending.pendingSettlementProjection)
      throw new Error("A producer wallet payment must settle before independence");
  }
  const rates = await exchangeRatesCollection(db)
    .find(
      { currencyCode: { $in: [...new Set(source.map((row) => row.currency as CurrencyCode))] } },
      { projection: { currencyCode: 1, rate: 1 } }
    )
    .toArray();
  const rateByCurrency = new Map(rates.map((row) => [row.currencyCode, row.rate]));
  const entries: LedgerEntryInput[] = source
    .filter((row) => row.cash > 0)
    .map((row) => {
      const rate = rateByCurrency.get(row.currency as CurrencyCode);
      if (!rate || !Number.isFinite(rate) || rate <= 0)
        throw new Error("Independence wallet migration needs an observed exchange rate");
      const currency = row.currency as CurrencyCode;
      return {
        turn,
        createdAt: new Date(),
        txType: "producer_market_transfer",
        emitSite: "referendum/secede/migrateProducerWallets",
        legs: [
          {
            account: accountId("economy_wallet", row._id, currency),
            amount: -row.cash,
            currencyCode: currency,
            anchorAmount: -row.cash / rate,
            role: "primary",
          },
          ...map[row._id].map((next) => {
            const amount = wallets.find((wallet) => wallet._id === next.id)!.cash;
            return {
              account: accountId("economy_wallet", next.id, currency),
              amount,
              currencyCode: currency,
              anchorAmount: amount / rate,
              role: "primary" as const,
            };
          }),
        ],
      };
    });
  // Source wallets may themselves owe invoices. Allocate those claims by debtor identity.
  for (const row of source) {
    const claims = remapProducerPayables(row.producerPayables?.claims ?? [], map);
    for (const wallet of wallets.filter((wallet) =>
      map[row._id].some((next) => next.id === wallet._id)
    )) {
      if (row.producerPayables)
        wallet.producerPayables = {
          ...row.producerPayables,
          claims: claims.filter((claim) => claim.debtorAccountId === wallet._id),
        };
    }
  }
  await accounts.insertMany(wallets);
  await accounts.bulkWrite(
    [...originals.values()].map((row) => ({
      updateOne: {
        filter: { _id: row._id },
        update: {
          $set: {
            ...(map[row._id] ? { cash: 0 } : {}),
            ...(row.producerPayables
              ? {
                  producerPayables: {
                    ...row.producerPayables,
                    claims: map[row._id]
                      ? []
                      : remapProducerPayables(row.producerPayables.claims, map),
                  },
                }
              : {}),
          },
        },
      },
    }))
  );
  if (corporations.length)
    await corporationsCollection(db).bulkWrite(
      corporations.map((row) => ({
        updateOne: {
          filter: { _id: row._id },
          update: {
            $set: {
              producerPayables: {
                ...row.producerPayables!,
                claims: remapProducerPayables(row.producerPayables!.claims, map),
              },
            },
          },
        },
      }))
    );
  await emitLedgerEntries(db, entries);
}
