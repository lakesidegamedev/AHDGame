/** The durable trade receipt state machine behind bank treasury bill trades: reserve, settle cash, pay escrow, mark. */
import type { BankTreasuryTradeReceipt, BankCharter } from "@/lib/db/types/bank";
import { type Bond, type BondHolder, BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import { type BankingTransition, oid } from "@/lib/banking/rules/boundary";
import { BANK_TREASURY_MAX_REMAINING_TURNS } from "@/lib/banking/rules/bankTreasury";
import { sovereignPrimaryTransition } from "@/lib/bonds/rules/sovereignPrimary";
import { BOND_MARKET_POOLS_COLLECTION } from "@/lib/db/types/bondMarketPool";
import { primaryDocumentId } from "@/lib/bonds/sovereignPrimarySettlement";
import { type Db, ObjectId } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencies";
import {
  type SettlementResult,
  settleTransition,
  resumeSettlement,
} from "@/lib/banking/settlementJournal";
import { settleAtomicDocumentTransition } from "@/lib/banking/atomicDocumentSettlement";
import { ensureFund } from "@/lib/banking/insurance";
import { loadBondPoolsByCurrency, bondPoolCurrency, loadBondQuote } from "@/lib/bonds/marketPool";
import type { Corporation } from "@/lib/db/types/corporation";
import { type BankingPolicySnapshot, savingsReadsAuthoritative } from "@/lib/banking/rules/policy";
import {
  thawHolderSnapshot,
  BANK_TREASURY_TRADES_COLLECTION,
  type BankState,
  poolSnapshot,
  activeHolderUnits,
  roundLocal,
  type BankTreasuryTradeResult,
  bankCashFloor,
} from "./bankTreasuryShared";
import { bondsCollection } from "@/lib/db/repositories/bonds";

export function reserveTransition(
  receipt: BankTreasuryTradeReceipt,
  bond: Bond
): BankingTransition {
  const key = `bank-treasury:${receipt._id}:reserve`;
  const position: BondHolder = {
    bankId: receipt.bankId,
    charteredTurn: receipt.charteredTurn,
    units: receipt.units,
    avgCostPerUnit: receipt.pricePerUnitLocal,
    bankTreasuryTradeId: receipt._id,
    ...(receipt.side === "buy" ? { bankTreasuryLotId: receipt._id } : {}),
  };
  const reserveProjection =
    receipt.side === "buy"
      ? {
          collection: "bonds",
          filter: {
            _id: oid(receipt.bondId.toHexString()),
            issuerType: "sovereign",
            ...(bond.currencyCode
              ? { currencyCode: receipt.currency }
              : { currencyCode: { $exists: false }, countryId: bond.countryId }),
            maturityTurn: {
              $gt: receipt.turn,
              ...(receipt.primary
                ? {}
                : { $lte: receipt.turn + BANK_TREASURY_MAX_REMAINING_TURNS }),
            },
            matured: { $ne: true },
            defaulted: { $ne: true },
            sovereignMaturityClaim: { $exists: false },
            [receipt.primary ? "unsoldUnits" : "publicFloat"]: { $gte: receipt.units },
          },
          update: {
            $inc: { [receipt.primary ? "unsoldUnits" : "publicFloat"]: -receipt.units },
            $push: { holders: position },
            $set: { updatedAt: receipt.createdAt },
          },
          note: "Reserve sovereign float units for the bank purchase before cash moves",
        }
      : (() => {
          const holderSnapshot = thawHolderSnapshot(receipt.holderSnapshot, bond.holders ?? []);
          const allocations = new Map(
            (receipt.allocations ?? []).map((allocation) => [allocation.lotId, allocation.units])
          );
          const availableByLot = new Map(
            holderSnapshot
              .filter(
                (holder) =>
                  holder.bankId?.equals(receipt.bankId) &&
                  holder.charteredTurn === receipt.charteredTurn &&
                  !holder.bankTreasuryTradeId &&
                  typeof holder.bankTreasuryLotId === "string"
              )
              .map((holder) => [holder.bankTreasuryLotId!, holder.units])
          );
          const completeAllocation = [...allocations].every(
            ([lotId, units]) => (availableByLot.get(lotId) ?? 0) >= units
          );
          if (!completeAllocation)
            throw new Error("Frozen treasury sale allocation exceeds its holder snapshot");
          const reservedHolders = holderSnapshot.map((holder) => {
            const lotId = holder.bankTreasuryLotId;
            const allocation =
              holder.bankId?.equals(receipt.bankId) &&
              holder.charteredTurn === receipt.charteredTurn &&
              lotId &&
              !holder.bankTreasuryTradeId
                ? (allocations.get(lotId) ?? 0)
                : 0;
            return allocation > 0 ? { ...holder, units: holder.units - allocation } : holder;
          });
          for (const allocation of receipt.allocations ?? []) {
            reservedHolders.push({
              ...position,
              bankTreasuryLotId: allocation.lotId,
              units: allocation.units,
            });
          }
          return {
            collection: "bonds",
            // The whole observed holder array is the reservation guard. One
            // sale either reserves every source lot or none of them, so a
            // concurrent sale cannot strand a partially reserved receipt.
            filter: { _id: oid(receipt.bondId.toHexString()) },
            update: {
              $set: { holders: reservedHolders, updatedAt: receipt.createdAt },
            },
            note: `Reserve all ${receipt.units} bank units across ${receipt.allocations?.length ?? 0} lots atomically`,
          };
        })();
  return {
    key,
    kind: "bank_treasury_trade_reservation",
    turn: receipt.turn,
    currency: receipt.currency,
    legs: [],
    projections: Array.isArray(reserveProjection) ? reserveProjection : [reserveProjection],
    event: {
      kind: "monetary.executed",
      command: `bank.treasury.${receipt.side}.reserve`,
      subjectType: "bank",
      subjectId: receipt.bankId.toHexString(),
      amount: receipt.amountLocal,
      meta: { bondId: bond._id.toHexString(), units: receipt.units },
    },
  };
}

export function settledInventoryProjections(
  receipt: BankTreasuryTradeReceipt
): BankingTransition["projections"] {
  if (receipt.side === "buy") {
    return [
      {
        collection: "bonds",
        filter: { _id: oid(receipt.bondId.toHexString()) },
        // Two writes: MongoDB refuses one update that both pulls from and
        // pushes to `holders`, so the reservation leaves first and the
        // settled lot follows under its own receipt.
        update: {
          $pull: { holders: { bankTreasuryTradeId: receipt._id } },
          ...(receipt.primary
            ? { $inc: { totalIssued: receipt.units * BOND_UNIT_FACE_VALUE } }
            : {}),
          $set: { updatedAt: receipt.updatedAt },
        },
        note: "Activate the reserved bank bond units after cash settles",
      },
      {
        collection: "bonds",
        filter: { _id: oid(receipt.bondId.toHexString()) },
        update: {
          $push: {
            holders: {
              bankId: receipt.bankId,
              charteredTurn: receipt.charteredTurn,
              bankTreasuryLotId: receipt._id,
              units: receipt.units,
              avgCostPerUnit: receipt.pricePerUnitLocal,
            },
          },
        },
        note: "Add the settled bank bond lot",
      },
    ];
  }
  return [
    {
      collection: "bonds",
      filter: { _id: oid(receipt.bondId.toHexString()) },
      update: {
        $inc: { publicFloat: receipt.units },
        $pull: { holders: { bankTreasuryTradeId: receipt._id } },
      },
      note: "Return sold bank units to public float after cash settles",
    },
    {
      collection: "bonds",
      filter: { _id: oid(receipt.bondId.toHexString()) },
      update: {
        $pull: {
          holders: {
            bankId: receipt.bankId,
            charteredTurn: receipt.charteredTurn,
            units: 0,
          },
        },
        $set: { updatedAt: receipt.updatedAt },
      },
      note: "Remove an empty bank treasury holder lot after sale",
    },
  ];
}

export function releaseReservationTransition(receipt: BankTreasuryTradeReceipt): BankingTransition {
  const projections: BankingTransition["projections"] =
    receipt.side === "buy"
      ? [
          {
            collection: "bonds",
            filter: {
              _id: oid(receipt.bondId.toHexString()),
              holders: { $elemMatch: { bankTreasuryTradeId: receipt._id } },
            },
            update: {
              $inc: { [receipt.primary ? "unsoldUnits" : "publicFloat"]: receipt.units },
              $pull: { holders: { bankTreasuryTradeId: receipt._id } },
              $set: { updatedAt: new Date() },
            },
            note: "Release an unpurchased sovereign float reservation",
          },
        ]
      : [
          ...(receipt.allocations ?? []).map((allocation) => ({
            collection: "bonds",
            filter: {
              _id: oid(receipt.bondId.toHexString()),
              holders: {
                $elemMatch: {
                  bankId: receipt.bankId,
                  charteredTurn: receipt.charteredTurn,
                  bankTreasuryLotId: allocation.lotId,
                  bankTreasuryTradeId: { $exists: false },
                },
              },
            },
            update: { $inc: { "holders.$.units": allocation.units } },
            note: `Restore ${allocation.units} units to bank lot ${allocation.lotId}`,
          })),
          {
            collection: "bonds",
            filter: {
              _id: oid(receipt.bondId.toHexString()),
              holders: { $elemMatch: { bankTreasuryTradeId: receipt._id } },
            },
            update: { $pull: { holders: { bankTreasuryTradeId: receipt._id } } },
            note: "Remove sale reservation after every source lot is restored",
          },
          {
            collection: "bonds",
            filter: { _id: oid(receipt.bondId.toHexString()) },
            update: {
              $pull: {
                holders: { bankId: receipt.bankId, charteredTurn: receipt.charteredTurn, units: 0 },
              },
              $set: { updatedAt: new Date() },
            },
            note: "Remove empty bank treasury lots after a refused sale",
          },
        ];
  return {
    key: `bank-treasury:${receipt._id}:release`,
    kind: "bank_treasury_trade_release",
    turn: receipt.turn,
    currency: receipt.currency,
    legs: [],
    projections,
    event: {
      kind: "monetary.executed",
      command: `bank.treasury.${receipt.side}.release`,
      subjectType: "bank",
      subjectId: receipt.bankId.toHexString(),
      amount: receipt.amountLocal,
      meta: { bondId: receipt.bondId.toHexString(), units: receipt.units },
    },
  };
}

export function cashTransition(
  receipt: BankTreasuryTradeReceipt,
  bond: Bond,
  floorLocal: number
): BankingTransition {
  if (receipt.primary) {
    const primary = receipt.primary;
    const transition = sovereignPrimaryTransition({
      key: `bank-treasury:${receipt._id}:cash`,
      turn: receipt.turn,
      currency: receipt.currency,
      budgetId: primary.budgetId,
      poolCash: receipt.amountLocal,
      monetaryCash: 0,
      face: receipt.units * BOND_UNIT_FACE_VALUE,
      annualCoupon: primary.annualCoupon,
      treasuryCashLedgerEnabled: true,
    });
    transition.legs[0] = {
      kind: "debit",
      amount: receipt.amountLocal,
      collection: "corporations",
      filter: {
        _id: oid(receipt.bankId.toHexString()),
        "bankCharter.currency": receipt.currency,
        "bankCharter.charteredTurn": receipt.charteredTurn,
        "bankCharter.status": "active",
        "bankCharter.type": { $in: ["investment", "universal"] },
        ...primary.balanceGuard,
        "bankCharter.cashReserves": {
          $eq: primary.cashReservesAtQuote,
          $gte: floorLocal + receipt.amountLocal,
        },
        bankPrimaryFunding: { $exists: false },
        bankUnderwritingFunding: { $exists: false },
        bankConstructionFunding: { $exists: false },
        bankCharterTransfer: { $exists: false },
      },
      path: "bankCharter.cashReserves",
      set: { bankPrimaryFunding: { tradeId: receipt._id, charteredTurn: receipt.charteredTurn } },
      note: "Investment bank funds original sovereign primary units above its cash floor",
    };
    transition.projections = [
      ...settledInventoryProjections(receipt),
      ...transition.projections.filter((p) => p.collection !== BOND_MARKET_POOLS_COLLECTION),
      {
        collection: "corporations",
        filter: {
          _id: oid(receipt.bankId.toHexString()),
          "bankPrimaryFunding.tradeId": receipt._id,
          "bankCharter.charteredTurn": receipt.charteredTurn,
        },
        update: {
          $inc: {
            "bankCharter.sovereignTreasuryMarkValue": receipt.units * primary.markPerUnitLocal,
          },
        },
        note: "Recognize only funded original-epoch sovereign holdings at executable bid",
      },
      {
        collection: "financialTxLog",
        insert: {
          _id: primaryDocumentId(`${transition.key}:receipt`),
          type: "gov_bond_issuance",
          turn: receipt.turn,
          createdAt: receipt.createdAt,
          subjectType: "government",
          countryId: primary.countryId,
          subjectName: `${primary.countryId} Government`,
          amount: receipt.amountLocal,
          currencyCode: receipt.currency,
          anchorAmount: receipt.amountLocal / primary.localPerAnchor,
          meta: {
            settlementKey: transition.key,
            ledgerOwnedBySettlement: true,
            bankId: receipt.bankId.toHexString(),
            charteredTurn: receipt.charteredTurn,
            bondId: receipt.bondId.toHexString(),
            units: receipt.units,
          },
          flagged: false,
        },
        note: "Publish the actual bank-funded primary issuer receipt",
      },
      ...(primary.ledgerShadow
        ? [
            {
              collection: "ledgerEntries",
              insert: {
                _id: primaryDocumentId(`${transition.key}:ledger`),
                turn: primary.ledgerTurn,
                createdAt: receipt.createdAt,
                txType: "gov_bond_issuance",
                balanced: true,
                emitSite: "banking/bankTreasury:sovereignPrimary",
                legs: [
                  {
                    account: `bank:${receipt.bankId}:${receipt.currency}`,
                    amount: -receipt.amountLocal,
                    currencyCode: receipt.currency,
                    anchorAmount: -receipt.amountLocal / primary.localPerAnchor,
                    role: "primary",
                  },
                  {
                    account: `government_cash:${primary.countryId}:${receipt.currency}`,
                    amount: receipt.amountLocal,
                    currencyCode: receipt.currency,
                    anchorAmount: receipt.amountLocal / primary.localPerAnchor,
                    role: "primary",
                  },
                ],
              },
              note: "Witness primary cash transfer without a mint or pool counterparty",
            },
          ]
        : []),
      {
        collection: BANK_TREASURY_TRADES_COLLECTION,
        filter: { _id: receipt._id },
        update: { $set: { status: "completed", updatedAt: receipt.updatedAt } },
        note: "Acknowledge primary issue after every funded cash and debt projection",
      },
      {
        collection: "corporations",
        filter: {
          _id: oid(receipt.bankId.toHexString()),
          "bankPrimaryFunding.tradeId": receipt._id,
        },
        update: { $unset: { bankPrimaryFunding: "" } },
        note: "Release original bank epoch only after the funded primary issue is acknowledged",
      },
    ];
    transition.event = {
      kind: "sovereign.primary_placed",
      command: "bank.sovereign.primary.subscribe",
      subjectType: "bank",
      subjectId: receipt.bankId.toHexString(),
      amount: receipt.amountLocal,
      meta: { bondId: receipt.bondId.toHexString(), units: receipt.units },
    };
    return transition;
  }
  const pool = {
    collection: BOND_MARKET_POOLS_COLLECTION,
    filter: { _id: receipt.currency },
    path: "cashLocal",
  };
  const bank = {
    collection: "corporations",
    filter: {
      _id: oid(receipt.bankId.toHexString()),
      "bankCharter.currency": receipt.currency,
      "bankCharter.charteredTurn": receipt.charteredTurn,
      "bankCharter.status": receipt.resolutionSale ? "failed" : "active",
    },
  };
  const escrowPath = `bankTreasuryEscrows.${receipt._id}.amountLocal`;
  const legs =
    receipt.side === "buy"
      ? [
          {
            kind: "debit" as const,
            amount: receipt.amountLocal,
            ...bank,
            path: "bankCharter.cashReserves",
            filter: {
              ...bank.filter,
              "bankCharter.cashReserves": { $gte: floorLocal + receipt.amountLocal },
            },
            note: "Pay for sovereign bill units from bank vault cash above the floor",
          },
          {
            kind: "credit" as const,
            amount: receipt.amountLocal,
            ...pool,
            note: "Credit the funded bond market pool for purchased units",
          },
        ]
      : [
          {
            kind: "debit" as const,
            amount: receipt.amountLocal,
            ...pool,
            filter: { _id: receipt.currency, cashLocal: { $gte: receipt.amountLocal } },
            note: "Pay bank sale proceeds from actual bond pool cash",
          },
          {
            kind: "credit" as const,
            amount: receipt.amountLocal,
            collection: "corporations",
            filter: { _id: oid(receipt.bankId.toHexString()) },
            path: escrowPath,
            note: "Hold funded sale proceeds until the bank epoch or insurer receives them",
            set: {
              [`bankTreasuryEscrows.${receipt._id}.bankId`]: receipt.bankId.toHexString(),
              [`bankTreasuryEscrows.${receipt._id}.charteredTurn`]: receipt.charteredTurn,
              [`bankTreasuryEscrows.${receipt._id}.currencyCode`]: receipt.currency,
              [`bankTreasuryEscrows.${receipt._id}.tradeId`]: receipt._id,
            },
          },
        ];
  const projections: BankingTransition["projections"] = [
    ...settledInventoryProjections({ ...receipt, updatedAt: new Date() }),
    {
      collection: BOND_MARKET_POOLS_COLLECTION,
      filter: { _id: receipt.currency },
      update: {
        $inc: {
          [`lifetime.${receipt.side === "buy" ? "purchasesIn" : "salesOut"}`]: receipt.amountLocal,
        },
        $set: { updatedAt: new Date() },
      },
      note: "Record the settled bank treasury flow in bond pool lifetime totals",
    },
  ];
  return {
    key: `bank-treasury:${receipt._id}:cash`,
    kind: `bank_treasury_${receipt.side}`,
    turn: receipt.turn,
    currency: receipt.currency,
    legs,
    projections,
    event: {
      kind: "monetary.executed",
      command: `bank.treasury.${receipt.side}`,
      subjectType: "bank",
      subjectId: receipt.bankId.toHexString(),
      amount: receipt.amountLocal,
      meta: {
        bondId: bond._id.toHexString(),
        units: receipt.units,
        pricePerUnitLocal: receipt.pricePerUnitLocal,
      },
    },
  };
}

export async function ensurePoolExists(db: Db, currency: CurrencyCode, now: Date): Promise<void> {
  await db
    .collection<{ _id: CurrencyCode } & Record<string, unknown>>(BOND_MARKET_POOLS_COLLECTION)
    .updateOne(
      { _id: currency },
      {
        $setOnInsert: {
          cashLocal: 0,
          targetCashLocal: 0,
          lifetime: {},
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true }
    );
}

export async function finishTransition(
  db: Db,
  transition: BankingTransition
): Promise<SettlementResult> {
  let result = await settleTransition(db, transition);
  if (result.status === "partial" || (result.status === "replayed" && result.error)) {
    result = await resumeSettlement(db, transition.key);
  }
  return result;
}

export async function paySaleEscrow(
  db: Db,
  receipt: BankTreasuryTradeReceipt
): Promise<SettlementResult> {
  const corporations = db.collection<BankState>("corporations");
  const bank = await corporations.findOne(
    { _id: receipt.bankId },
    { projection: { bankCharter: 1, bankTreasuryEscrows: 1 } }
  );
  const charter = bank?.bankCharter;
  const escrowPath = `bankTreasuryEscrows.${receipt._id}.amountLocal`;
  const matchingEpoch =
    charter?.currency === receipt.currency && charter.charteredTurn === receipt.charteredTurn;
  const estateOpen = charter?.status === "failed" && charter.depositorsResolvedTurn == null;
  if (matchingEpoch && (charter?.status === "active" || estateOpen)) {
    const realizedGain = Number.isFinite(receipt.costBasisLocal)
      ? receipt.amountLocal - receipt.costBasisLocal!
      : 0;
    const transition: BankingTransition = {
      key: `bank-treasury:${receipt._id}:vault`,
      kind: "bank_treasury_sale_to_vault",
      turn: receipt.turn,
      currency: receipt.currency,
      legs: [
        {
          kind: "debit",
          amount: receipt.amountLocal,
          collection: "corporations",
          filter: { _id: oid(receipt.bankId.toHexString()) },
          path: escrowPath,
          note: "Release funded bank bond sale escrow",
        },
        {
          kind: "credit",
          amount: receipt.amountLocal,
          collection: "corporations",
          filter: { _id: oid(receipt.bankId.toHexString()) },
          path: "bankCharter.cashReserves",
          note: "Credit proceeds to the matching bank epoch or its open failure estate",
        },
      ],
      projections: [
        {
          collection: "corporations",
          filter: { _id: oid(receipt.bankId.toHexString()) },
          update: {
            $inc: {
              [escrowPath]: -receipt.amountLocal,
              "bankCharter.cashReserves": receipt.amountLocal,
              ...(realizedGain !== 0
                ? { "bankCharter.treasuryRealizedGainPaidLifetime": realizedGain }
                : {}),
            },
          },
          note: "Atomically release sale cash from escrow to the matching bank estate",
        },
      ],
      event: {
        kind: "monetary.executed",
        command: "bank.treasury.sell.vault",
        subjectType: "bank",
        subjectId: receipt.bankId.toHexString(),
        amount: receipt.amountLocal,
      },
    };
    const settled = await settleAtomicDocumentTransition(db, transition, {
      identity: { _id: oid(receipt.bankId.toHexString()) },
      guard: {
        [escrowPath]: { $gte: receipt.amountLocal },
        "bankCharter.currency": receipt.currency,
        "bankCharter.charteredTurn": receipt.charteredTurn,
        "bankCharter.status": charter?.status,
      },
    });
    if (settled.status === "partial" || (settled.status === "replayed" && settled.error)) {
      return resumeSettlement(db, transition.key);
    }
    if (settled.status === "applied" || (settled.status === "replayed" && !settled.error))
      return settled;
    const current = await corporations.findOne(
      { _id: receipt.bankId },
      { projection: { bankCharter: 1 } }
    );
    if (
      current?.bankCharter?.currency === receipt.currency &&
      current.bankCharter.charteredTurn === receipt.charteredTurn &&
      (current.bankCharter.status === "active" ||
        (current.bankCharter.status === "failed" &&
          current.bankCharter.depositorsResolvedTurn == null))
    )
      return settled;
  }
  await ensureFund(db, receipt.currency);
  const insurance: BankingTransition = {
    key: `bank-treasury:${receipt._id}:insurance`,
    kind: "bank_treasury_sale_to_insurance",
    turn: receipt.turn,
    currency: receipt.currency,
    legs: [
      {
        kind: "debit",
        amount: receipt.amountLocal,
        collection: "corporations",
        filter: {
          _id: oid(receipt.bankId.toHexString()),
          [escrowPath]: { $gte: receipt.amountLocal },
        },
        path: escrowPath,
        note: "Release closed-epoch bank treasury proceeds from escrow",
      },
      {
        kind: "credit",
        amount: receipt.amountLocal,
        collection: "depositInsuranceFunds",
        filter: { _id: receipt.currency },
        path: "balance",
        note: "Route closed-epoch bank treasury proceeds to deposit insurance",
      },
    ],
    projections: [],
    event: {
      kind: "monetary.executed",
      command: "bank.treasury.sell.insurance",
      subjectType: "bank",
      subjectId: receipt.bankId.toHexString(),
      amount: receipt.amountLocal,
    },
  };
  return finishTransition(db, insurance);
}

export async function markBankTreasury(
  db: Db,
  bankId: ObjectId,
  charter: BankCharter,
  turn: number
): Promise<number> {
  const bonds = await bondsCollection(db)
    .find({
      issuerType: "sovereign",
      matured: { $ne: true },
      defaulted: { $ne: true },
      holders: {
        $elemMatch: {
          bankId,
          charteredTurn: charter.charteredTurn,
          bankTreasuryTradeId: { $exists: false },
          units: { $gt: 0 },
        },
      },
    })
    .toArray();
  const pools = await loadBondPoolsByCurrency(db);
  let mark = 0;
  for (const bond of bonds) {
    if (bondPoolCurrency(bond) !== charter.currency) continue;
    const quote = await loadBondQuote(db, bond, {
      pools: new Map([[charter.currency, poolSnapshot(pools.get(charter.currency))]]),
    });
    mark += activeHolderUnits(bond.holders ?? [], bankId, charter.charteredTurn) * quote.bidPerUnit;
  }
  mark = roundLocal(mark, charter.currency);
  await db.collection<Corporation>("corporations").updateOne(
    {
      _id: bankId,
      "bankCharter.currency": charter.currency,
      "bankCharter.charteredTurn": charter.charteredTurn,
    },
    {
      $set: {
        "bankCharter.sovereignTreasuryMarkValue": mark,
        "bankCharter.lastTreasuryMarkTurn": turn,
        updatedAt: new Date(),
      },
    }
  );
  return mark;
}

export async function updateReceipt(
  db: Db,
  receipt: BankTreasuryTradeReceipt,
  status: BankTreasuryTradeReceipt["status"],
  error?: string
): Promise<void> {
  await db
    .collection<BankTreasuryTradeReceipt>(BANK_TREASURY_TRADES_COLLECTION)
    .updateOne(
      { _id: receipt._id, status: "open" },
      { $set: { status, updatedAt: new Date(), ...(error ? { error } : {}) } }
    );
}

export async function runReceipt(
  db: Db,
  receipt: BankTreasuryTradeReceipt,
  policy: BankingPolicySnapshot
): Promise<BankTreasuryTradeResult> {
  if (!policy.bankTreasury)
    return {
      status: "rejected",
      tradeId: receipt._id,
      side: receipt.side,
      units: receipt.units,
      amountLocal: receipt.amountLocal,
      error: "Bank treasury bills are disabled",
    };
  const bankId = receipt.bankId;
  const [bank, bond] = await Promise.all([
    db
      .collection<BankState>("corporations")
      .findOne({ _id: bankId }, { projection: { bankCharter: 1 } }),
    bondsCollection(db).findOne({ _id: receipt.bondId }),
  ]);
  if (!bond)
    return {
      status: "rejected",
      tradeId: receipt._id,
      side: receipt.side,
      units: receipt.units,
      amountLocal: receipt.amountLocal,
      error: "Sovereign bill no longer exists",
    };
  const charter = bank?.bankCharter;
  const exactActive =
    charter?.status === "active" &&
    charter.currency === receipt.currency &&
    charter.charteredTurn === receipt.charteredTurn;
  const sameOpenEstate =
    charter?.status === "failed" &&
    charter.currency === receipt.currency &&
    charter.charteredTurn === receipt.charteredTurn &&
    charter.depositorsResolvedTurn == null;
  if (!exactActive && (receipt.side === "buy" || !sameOpenEstate || !receipt.resolutionSale)) {
    const reserveRecord = await db
      .collection<{ _id: string; status?: string }>("bankMoneyMoves")
      .findOne({ _id: `bank-treasury:${receipt._id}:reserve` }, { projection: { status: 1 } });
    const cashRecord = await db
      .collection<{ _id: string; status?: string }>("bankMoneyMoves")
      .findOne({ _id: `bank-treasury:${receipt._id}:cash` }, { projection: { status: 1 } });
    if (reserveRecord && !cashRecord) {
      // A reservation may have landed before its journal acknowledgement.
      // Finish that original outcome before returning its unfunded inventory.
      const originalReserve = await resumeSettlement(db, reserveRecord._id);
      if (originalReserve.error || originalReserve.status === "partial")
        return {
          status: "pending",
          tradeId: receipt._id,
          side: receipt.side,
          units: receipt.units,
          amountLocal: receipt.amountLocal,
          error: originalReserve.error,
        };
      if (["applied", "replayed"].includes(originalReserve.status)) {
        const release = await finishTransition(db, releaseReservationTransition(receipt));
        if (release.error || !["applied", "replayed"].includes(release.status))
          return {
            status: "pending",
            tradeId: receipt._id,
            side: receipt.side,
            units: receipt.units,
            amountLocal: receipt.amountLocal,
            error: release.error,
          };
      }
    } else if (cashRecord?.status === "partial") {
      const resumed = await resumeSettlement(db, cashRecord._id);
      if (resumed.status === "partial" || (resumed.status === "replayed" && resumed.error)) {
        return {
          status: "pending",
          tradeId: receipt._id,
          side: receipt.side,
          units: receipt.units,
          amountLocal: receipt.amountLocal,
          error: resumed.error,
        };
      }
      if (resumed.status === "applied" || (resumed.status === "replayed" && !resumed.error)) {
        if (receipt.side === "sell") {
          const paid = await paySaleEscrow(db, receipt);
          if (paid.status === "partial" || (paid.status === "replayed" && paid.error)) {
            return {
              status: "pending",
              tradeId: receipt._id,
              side: receipt.side,
              units: receipt.units,
              amountLocal: receipt.amountLocal,
              error: paid.error,
            };
          }
        }
        await updateReceipt(db, receipt, "completed");
        return {
          status: "completed",
          tradeId: receipt._id,
          side: receipt.side,
          units: receipt.units,
          amountLocal: receipt.amountLocal,
        };
      }
      await finishTransition(db, releaseReservationTransition(receipt));
    } else if (cashRecord?.status === "applied") {
      if (receipt.side === "sell") {
        const paid = await paySaleEscrow(db, receipt);
        if (paid.status !== "applied" && !(paid.status === "replayed" && !paid.error)) {
          return {
            status: "pending",
            tradeId: receipt._id,
            side: receipt.side,
            units: receipt.units,
            amountLocal: receipt.amountLocal,
            error: paid.error,
          };
        }
      }
      await updateReceipt(db, receipt, "completed");
      return {
        status: "completed",
        tradeId: receipt._id,
        side: receipt.side,
        units: receipt.units,
        amountLocal: receipt.amountLocal,
      };
    }
    const error = "Bank charter epoch ended before the trade settled";
    await updateReceipt(db, receipt, "rejected", error);
    return {
      status: "rejected",
      tradeId: receipt._id,
      side: receipt.side,
      units: receipt.units,
      amountLocal: receipt.amountLocal,
      error,
    };
  }

  const reserve = reserveTransition(receipt, bond);
  const reserved =
    receipt.side === "sell"
      ? await settleAtomicDocumentTransition(db, reserve, {
          identity: { _id: oid(receipt.bondId.toHexString()) },
          guard: {
            holders: thawHolderSnapshot(receipt.holderSnapshot, bond.holders ?? []),
            sovereignMaturityClaim: { $exists: false },
          },
          nonCashMode: "bank_treasury_inventory",
        })
      : await finishTransition(db, reserve);
  if (reserved.status === "rejected") {
    await updateReceipt(db, receipt, "rejected", reserved.error);
    return {
      status: "rejected",
      tradeId: receipt._id,
      side: receipt.side,
      units: receipt.units,
      amountLocal: receipt.amountLocal,
      error: reserved.error ?? "Bond reservation was refused",
    };
  }
  if (reserved.status === "partial" || (reserved.status === "replayed" && reserved.error)) {
    return {
      status: "pending",
      tradeId: receipt._id,
      side: receipt.side,
      units: receipt.units,
      amountLocal: receipt.amountLocal,
      error: reserved.error,
    };
  }

  if (!receipt.primary) await ensurePoolExists(db, receipt.currency, receipt.createdAt);
  const overviewFloor = exactActive
    ? await bankCashFloor(db, charter!, savingsReadsAuthoritative(policy, receipt.currency), bankId)
    : { floorLocal: 0, requiredReserves: 0, withdrawalBufferLocal: 0, nextTurnDueInterest: 0 };
  const transition = cashTransition(receipt, bond, overviewFloor.floorLocal);
  const moved = await finishTransition(db, transition);
  if (moved.status === "rejected") {
    const released = await finishTransition(db, releaseReservationTransition(receipt));
    if (released.status === "applied" || (released.status === "replayed" && !released.error)) {
      await updateReceipt(db, receipt, "rejected", moved.error);
      return {
        status: "rejected",
        tradeId: receipt._id,
        side: receipt.side,
        units: receipt.units,
        amountLocal: receipt.amountLocal,
        error: moved.error ?? "Trade cash leg was refused",
      };
    }
    return {
      status: "pending",
      tradeId: receipt._id,
      side: receipt.side,
      units: receipt.units,
      amountLocal: receipt.amountLocal,
      error: released.error ?? moved.error,
    };
  }
  if (moved.status === "partial" || (moved.status === "replayed" && moved.error)) {
    return {
      status: "pending",
      tradeId: receipt._id,
      side: receipt.side,
      units: receipt.units,
      amountLocal: receipt.amountLocal,
      error: moved.error,
    };
  }

  if (receipt.side === "sell") {
    const paid = await paySaleEscrow(db, receipt);
    if (paid.status !== "applied" && !(paid.status === "replayed" && !paid.error)) {
      return {
        status: "pending",
        tradeId: receipt._id,
        side: receipt.side,
        units: receipt.units,
        amountLocal: receipt.amountLocal,
        error: paid.error,
      };
    }
  }
  const current = await db
    .collection<BankState>("corporations")
    .findOne({ _id: bankId }, { projection: { bankCharter: 1 } });
  if (current?.bankCharter) await markBankTreasury(db, bankId, current.bankCharter, receipt.turn);
  await updateReceipt(db, receipt, "completed");
  return {
    status: "completed",
    tradeId: receipt._id,
    side: receipt.side,
    units: receipt.units,
    amountLocal: receipt.amountLocal,
  };
}
