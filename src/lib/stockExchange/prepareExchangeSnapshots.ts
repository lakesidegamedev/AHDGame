import { ObjectId, type Db } from "mongodb";
import { getDb } from "@/lib/mongodb";

import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";

import { nppsCollection } from "@/lib/db/repositories/npps";
import type { Document } from "mongodb";

import { imperialCharactersCollection } from "@/lib/db/repositories/imperialCharacters";

export async function prepareExchangeSnapshots(currentTurn: number, db?: Db) {
  const database = db ?? (await getDb());
  const now = new Date();

  // Fetch all data needed for snapshots
  const corporationsHandle = corporationsCollection(database);
  // Repairs public corporations left with hiddenFromExchange set by a
  // late IPO that cleared isPrivate but not the auction marker, which
  // hides them from every exchange. New IPOs clear it in goPublic.
  await corporationsHandle.updateMany(
    {
      isPrivate: { $ne: true },
      hiddenFromExchange: true,
      lastIpoTurn: { $exists: true },
    },
    { $set: { hiddenFromExchange: false } }
  );
  const corporations = await corporationsHandle
    .find(
      { hiddenFromExchange: { $ne: true }, isPrivate: { $ne: true } },
      {
        // The snapshot quotes name/ticker/price/share count and the
        // currency needed to restate them. It never reads a balance sheet,
        // portfolio or settlement history, and this is every public corp.
        projection: {
          name: 1,
          sequentialId: 1,
          tickerSymbol: 1,
          type: 1,
          secondaryType: 1,
          headquartersState: 1,
          logoUrl: 1,
          brandColor: 1,
          dividendRate: 1,
          ceoId: 1,
          ceoType: 1,
          ceoVacant: 1,
          countryId: 1,
          countryOwnerId: 1,
          liquidCurrencyCode: 1,
          sharePrice: 1,
          totalShares: 1,
          publicFloat: 1,
          typeSwitchTurn: 1,
          logisticsStrength: 1,
          imfBailoutActive: 1,
        },
      }
    )
    .sort({ createdAt: -1 })
    .toArray();

  if (corporations.length === 0) return { kind: "early" as const, value: undefined };

  // Fetch CEO info (filter out corporations without a CEO)
  const regularCeoIds = corporations
    .filter((c) => c.ceoType !== "imperial" && c.ceoType !== "npp" && c.ceoId)
    .map((c) => c.ceoId);
  const imperialCeoIds = corporations
    .filter((c) => c.ceoType === "imperial" && c.ceoId)
    .map((c) => c.ceoId);
  const nppCeoIds = corporations.filter((c) => c.ceoType === "npp" && c.ceoId).map((c) => c.ceoId);

  const [characters, imperialChars, nppChars] = await Promise.all([
    regularCeoIds.length > 0
      ? charactersCollection(database)
          .find({ _id: { $in: regularCeoIds } })
          .project<{ _id: ObjectId; name: string; avatarUrl?: string; sequentialId?: number }>({
            _id: 1,
            name: 1,
            avatarUrl: 1,
            sequentialId: 1,
          })
          .toArray()
      : Promise.resolve([]),
    imperialCeoIds.length > 0
      ? imperialCharactersCollection<Document>(database)
          .find({ _id: { $in: imperialCeoIds } })
          .project<{ _id: ObjectId; name: string; avatarUrl?: string; sequentialId?: number }>({
            _id: 1,
            name: 1,
            avatarUrl: 1,
            sequentialId: 1,
          })
          .toArray()
      : Promise.resolve([]),
    nppCeoIds.length > 0
      ? nppsCollection<Document>(database)
          .find({ _id: { $in: nppCeoIds } })
          .project<{ _id: ObjectId; name: string; avatarUrl?: string; sequentialId?: number }>({
            _id: 1,
            name: 1,
            avatarUrl: 1,
            sequentialId: 1,
          })
          .toArray()
      : Promise.resolve([]),
  ]);
  const ceoMap = new Map(
    [...characters, ...imperialChars, ...nppChars].map((c) => [c._id.toString(), c])
  );

  // Fetch sectors and multi-timeframe price history (1h, 24h, 48h)
  const corpIds = corporations.map((c) => c._id);
  const turn1Ago = Math.max(1, currentTurn - 1);
  const turn24Ago = Math.max(1, currentTurn - 24);
  const turn48Ago = Math.max(1, currentTurn - 48);

  // One branch per comparison target, each answering "the corporation's
  // newest row at or before this turn". A $match bounded by turn, then a
  // sort on the group key and a $first-only $group, is a DISTINCT_SCAN on
  // { corporationId: 1, turn: -1 }: one index entry per corporation instead
  // of the whole 48-turn window per corporation (#2693 read ~96k rows here
  // to pick three points).
  const atOrBeforeBranch = (slot: string, targetTurn: number) => [
    { $match: { corporationId: { $in: corpIds }, turn: { $lte: targetTurn } } },
    { $sort: { corporationId: 1, turn: -1 } },
    {
      $group: {
        _id: "$corporationId",
        turn: { $first: "$turn" },
        sharePrice: { $first: "$sharePrice" },
        totalShares: { $first: "$totalShares" },
        createdAt: { $first: "$createdAt" },
        ...(slot === "settled"
          ? {
              financial: {
                $first: {
                  income: "$income",
                  revenue: "$revenue",
                  currencyCode: "$currencyCode",
                  fxRateAtWrite: "$fxRateAtWrite",
                  settledBankLoanInterestPaid: "$settledBankLoanInterestPaid",
                  settledImfInterestPaid: "$settledImfInterestPaid",
                  settledImfInterestReceived: "$settledImfInterestReceived",
                  settledImfPrincipalPaid: "$settledImfPrincipalPaid",
                  settledImfPrincipalReceived: "$settledImfPrincipalReceived",
                  imfSettlementUnavailable: "$imfSettlementUnavailable",
                  settledBondCouponIncome: "$settledBondCouponIncome",
                  settledBondInterestPaid: "$settledBondInterestPaid",
                  perTurnBondCouponIncome: "$perTurnBondCouponIncome",
                  perTurnBondDragOnNetIncome: "$perTurnBondDragOnNetIncome",
                  perTurnBondInterestExpense: "$perTurnBondInterestExpense",
                  bondCouponFxFees: "$bondCouponFxFees",
                  dividendIncomeReceived: "$dividendIncomeReceived",
                },
              },
            }
          : {}),
      },
    },
    {
      $project: {
        _id: 0,
        corporationId: "$_id",
        slot: { $literal: slot },
        turn: 1,
        sharePrice: 1,
        totalShares: 1,
        createdAt: 1,
        ...(slot === "settled" ? { financial: 1 } : {}),
      },
    },
  ];
  // Each corporation's oldest row, the fallback when no row is at or before
  // a target. The window bound is exact rather than approximate: a
  // corporation that needs the fallback for any target has no row at or
  // before turn48Ago, so every row it owns is inside the window and its
  // oldest row in the window is its oldest row.
  const earliestBranch = () => [
    { $match: { corporationId: { $in: corpIds }, turn: { $gte: turn48Ago } } },
    // Exact reverse of { corporationId: 1, turn: -1 } so the index is walked
    // backwards as a DISTINCT_SCAN. { corporationId: 1, turn: 1 } matches
    // neither direction and sorts the whole window in memory.
    { $sort: { corporationId: -1, turn: 1 } },
    {
      $group: {
        _id: "$corporationId",
        turn: { $first: "$turn" },
        sharePrice: { $first: "$sharePrice" },
        totalShares: { $first: "$totalShares" },
        createdAt: { $first: "$createdAt" },
      },
    },
    {
      $project: {
        _id: 0,
        corporationId: "$_id",
        slot: { $literal: "earliest" },
        turn: 1,
        sharePrice: 1,
        totalShares: 1,
        createdAt: 1,
      },
    },
  ];
  // The slots land in one array per corporation, keyed by slot, so a slot
  // with no qualifying row is simply absent.
  const slotToPoint = (slot: string) => ({
    $arrayElemAt: [
      {
        $map: {
          input: {
            $filter: {
              input: "$slots",
              as: "s",
              cond: { $eq: ["$$s.slot", slot] },
            },
          },
          as: "s",
          in: {
            turn: "$$s.turn",
            sharePrice: "$$s.sharePrice",
            totalShares: "$$s.totalShares",
            createdAt: "$$s.createdAt",
            ...(slot === "settled" ? { financial: "$$s.financial" } : {}),
          },
        },
      },
      0,
    ],
  });
  return {
    kind: "context" as const,
    context: {
      atOrBeforeBranch,
      ceoMap,
      corpIds,
      corporations,
      currentTurn,
      database,
      earliestBranch,
      now,
      slotToPoint,
      turn1Ago,
      turn24Ago,
      turn48Ago,
    },
  };
}
