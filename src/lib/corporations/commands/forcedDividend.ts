import { ObjectId, type Db, type Document, type AnyBulkWriteOperation } from "mongodb";
import { withSessionDb } from "@/lib/db/sessionDb";
import { ApiError, notFound } from "@/lib/api/errors";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { imperialCharactersCollection } from "@/lib/db/repositories/imperialCharacters";
import { nppsCollection } from "@/lib/db/repositories/npps";
import { indexFundsCollection } from "@/lib/db/repositories/indexFunds";
import { planDividendAllocation } from "../rules/dividendAllocation";
import { unplacedIpoShares } from "../rules/dividendShares";
import {
  corporateCashEncumbered,
  corporateDiscretionaryCashGuard,
} from "../rules/discretionaryCash";
import {
  loadFxRatesByCurrency,
  fxRateForCorpFromMap,
  resolveCorpLiquidCurrencyCode,
  anchorToCorpLiquidCapital,
  corpLiquidCapitalToAnchor,
} from "@/lib/currency/corporationCapital";
import { buildPersonalBalanceInc } from "@/lib/currency/characterFunds";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { creditEquityPool } from "@/lib/equities/marketPool";
import { processIndexFundDividend } from "@/lib/indexFunds/dividendPassThrough";
import { emitTxBulk, loadTxThresholds, type TxInput } from "@/lib/financialTxLog/emit";
import { getCurrentTurn } from "@/lib/currentTurn";

/** Pay every placed owner bucket, retaining amounts without a valid recipient. */
export async function settleForcedDividend(db: Db, id: ObjectId, payoutKey: string) {
  return withSessionDb(db, async (db) => {
    const corp = await corporationsCollection(db).findOne({ _id: id });
    if (!corp) throw notFound("Corporation not found");
    const rate = corp.dividendRate ?? 0;
    if (!Number.isFinite(rate) || rate < 0 || rate > 100)
      throw new ApiError(409, "Invalid dividend rate");
    if (corporateCashEncumbered(corp))
      throw new ApiError(409, "Settle operating and tax liabilities before distributing cash.");
    const pool = (Math.max(0, corp.liquidCapital ?? 0) * rate) / 100;
    if (!(pool > 0)) return { success: true, paid: 0, recipients: 0 };
    const rows = corp.shareholders ?? [],
      now = new Date(),
      turn = await getCurrentTurn(db);
    const allocation = planDividendAllocation({
      pool,
      totalShares: corp.totalShares ?? 0,
      publicFloat: corp.publicFloat ?? 0,
      unplacedIpoShares: unplacedIpoShares(corp),
      holderShares: rows.map((row) => row.shares),
    });
    const fx = await loadFxRatesByCurrency(db),
      forex = await isForexEnabled();
    const issuerRate = fxRateForCorpFromMap(corp, fx),
      currency = resolveCorpLiquidCurrencyCode(corp) ?? "USD";
    const grouped = new Map<string, AnyBulkWriteOperation<Document>[]>();
    const ledger: TxInput[] = [];
    let paid = 0,
      recipients = 0;
    const heldCorps = await corporationsCollection(db)
      .find(
        { _id: { $in: rows.flatMap((row) => (row.corporationId ? [row.corporationId] : [])) } },
        { projection: { liquidCurrencyCode: 1, countryId: 1, name: 1 } }
      )
      .toArray();
    const corpsById = new Map(heldCorps.map((row) => [row._id.toHexString(), row]));
    const [people, imperialPeople, politicians] = await Promise.all([
      charactersCollection(db)
        .find(
          { _id: { $in: rows.flatMap((row) => (row.characterId ? [row.characterId] : [])) } },
          { projection: { name: 1 } }
        )
        .toArray(),
      imperialCharactersCollection(db)
        .find(
          {
            _id: {
              $in: rows.flatMap((row) =>
                row.imperialCharacterId ? [row.imperialCharacterId] : []
              ),
            },
          },
          { projection: { name: 1 } }
        )
        .toArray(),
      nppsCollection(db)
        .find(
          { _id: { $in: rows.flatMap((row) => (row.nppId ? [row.nppId] : [])) } },
          { projection: { name: 1 } }
        )
        .toArray(),
    ]);
    const recipientNames = new Map([
      ...people.map((row) => ["characters:" + row._id.toHexString(), row.name] as const),
      ...imperialPeople.map(
        (row) => ["imperialCharacters:" + row._id.toHexString(), row.name] as const
      ),
      ...politicians.map((row) => ["npps:" + row._id.toHexString(), row.name] as const),
      ...heldCorps.map((row) => ["corporations:" + row._id.toHexString(), row.name] as const),
    ]);

    const funds = await indexFundsCollection(db)
      .find(
        { _id: { $in: rows.flatMap((row) => (row.fundId ? [row.fundId] : [])) } },
        { projection: { unitSupply: 1 } }
      )
      .toArray();
    const fundsById = new Map(funds.map((row) => [row._id.toHexString(), row]));
    for (const [index, row] of rows.entries()) {
      const amount = allocation.holders[index];
      if (!(amount > 0)) continue;
      const anchor = corpLiquidCapitalToAnchor(amount, corp, issuerRate);
      if (row.fundId) {
        const fund = fundsById.get(row.fundId.toHexString());
        if (!fund)
          throw new ApiError(409, "A fund shareholder needs reconciliation before distribution.");
        await processIndexFundDividend(db, row.fundId, anchor, id, row.shares, {
          turn,
          payoutKey: "admin:" + payoutKey,
        });
        paid += amount;
        recipients++;
        continue;
      }
      const collection = row.characterId
        ? "characters"
        : row.imperialCharacterId
          ? "imperialCharacters"
          : row.nppId
            ? "npps"
            : row.corporationId
              ? "corporations"
              : null;
      const recipient =
        row.characterId ?? row.imperialCharacterId ?? row.nppId ?? row.corporationId;
      if (!collection || !recipient) continue;
      let recipientAmount = amount;
      let recipientCurrency = currency;
      let increments: Record<string, number>;
      if (collection === "corporations") {
        const target = corpsById.get(recipient.toHexString());
        if (!target)
          throw new ApiError(
            409,
            "A corporate shareholder needs reconciliation before distribution."
          );
        recipientAmount = anchorToCorpLiquidCapital(
          anchor,
          target,
          fxRateForCorpFromMap(target, fx)
        );
        recipientCurrency = resolveCorpLiquidCurrencyCode(target) ?? "USD";
        increments = { liquidCapital: recipientAmount };
      } else {
        recipientAmount = forex || collection === "npps" ? amount : anchor;
        increments =
          collection === "npps"
            ? { ["currencyBalances.personal." + currency]: recipientAmount }
            : buildPersonalBalanceInc(recipientAmount, currency, forex);
      }
      const writes = grouped.get(collection) ?? [];
      writes.push({ updateOne: { filter: { _id: recipient }, update: { $inc: increments } } });
      grouped.set(collection, writes);
      ledger.push({
        type: "corp_dividend",
        turn,
        createdAt: now,
        subjectType:
          collection === "corporations"
            ? "corporation"
            : collection === "npps"
              ? "npp"
              : "character",
        subjectId: recipient,
        subjectName:
          recipientNames.get(collection + ":" + recipient.toHexString()) ?? "Dividend shareholder",
        amount: recipientAmount,
        currencyCode: recipientCurrency,
        anchorAmount: anchor,
        counterpartyType: "corporation",
        counterpartyId: id,
        counterpartyName: corp.name,
        meta: { kind: "admin_forced_dividend", imperial: collection === "imperialCharacters" },
      });
      paid += amount;
      recipients++;
    }
    const floatPayment = Math.floor(allocation.publicFloat * 100 + 1e-8) / 100;
    if (floatPayment > 0) {
      await creditEquityPool(db, currency, floatPayment, "dividendsIn", now);
      paid += floatPayment;
      recipients++;
    }
    if (paid > pool + 1e-8) throw new Error("Dividend allocation exceeds funded cash");
    if (!(paid > 0)) return { success: true, paid: 0, recipients: 0 };
    const debit = await corporationsCollection(db).updateOne(
      { _id: id, liquidCapital: { $gte: paid }, ...corporateDiscretionaryCashGuard() },
      { $inc: { liquidCapital: -paid }, $set: { updatedAt: now } }
    );
    if (debit.matchedCount !== 1)
      throw new ApiError(409, "Corporation cash changed before distribution");
    for (const [name, writes] of grouped) {
      const collection =
        name === "characters"
          ? charactersCollection<Document>(db)
          : name === "imperialCharacters"
            ? imperialCharactersCollection<Document>(db)
            : name === "npps"
              ? nppsCollection<Document>(db)
              : corporationsCollection<Document>(db);
      const result = await collection.bulkWrite(writes);
      if (result.matchedCount !== writes.length)
        throw new ApiError(409, "A shareholder disappeared before distribution");
    }
    ledger.push({
      type: "corp_dividend",
      turn,
      createdAt: now,
      subjectType: "corporation",
      subjectId: id,
      subjectName: corp.name,
      amount: -paid,
      currencyCode: currency,
      anchorAmount: -corpLiquidCapitalToAnchor(paid, corp, issuerRate),
      counterpartyType: "system",
      counterpartyName: "Dividend recipients",
      meta: { kind: "admin_forced_dividend", recipients },
    });
    await emitTxBulk(db, ledger, await loadTxThresholds(db));
    return { success: true, paid, recipients };
  });
}
