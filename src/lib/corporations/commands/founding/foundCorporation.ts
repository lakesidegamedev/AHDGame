import { ObjectId, type Db } from "mongodb";
import type { z } from "zod";
import { getNewCorporationFoundingBarrier } from "@/lib/character/newCharacterTransferBarrier";
import { getGameTime } from "@/lib/time/gameTime";
import { purchasedHoldingTerms } from "@/lib/corporations/rules/holdingTerms";
import { loadCampaignCurrencyRates } from "@/lib/campaigns/campaignCurrency";
import { loadBankingPolicy } from "@/lib/banking/policy";
import {
  DEFAULT_PRIMARY_UNDERWRITING_FEE_RATE,
  primaryUnderwritingCharterEligible,
  quotePrimaryUnderwritingFee,
} from "@/lib/banking/rules/underwriting";
import type { PrimaryUnderwritingOffer } from "@/lib/banking/underwritingTypes";
import { capturePrimaryUnderwritingCurrencySnapshot } from "@/lib/banking/underwritingTypes";
import { settlePrimaryUnderwritingFill } from "@/lib/banking/underwritingSettlement";
import type { TransitionProjection } from "@/lib/banking/rules/boundary";
import { issuanceDilutionFactorExpr } from "@/lib/corporations/shareConsolidation";
import { getGameStatePresetOrDefault } from "@/lib/db/collections/gameState";
import { getEraFoundingBounds, getEraFounderShares } from "@/lib/constants/sectorSeedEra";
import type { foundCorporationSchema } from "@/lib/api/schemas/corporations";
import { randomBrandColor } from "@/lib/corporations/brandColor";
import type { Character, Corporation, State, User } from "@/lib/db/types";
import { getNextSequentialId } from "@/lib/db/sequentialId";
import { openCeoTenure } from "@/lib/corporations/ceoHistory";
import {
  CORPORATION_FOUNDING_COST,
  MIN_CORPORATION_STARTING_CAPITAL,
  MAX_CORPORATION_STARTING_CAPITAL,
  CORPORATION_STARTING_CAPITAL,
  OPERATING_SECTOR_TYPE_LABELS,
  CEO_INITIAL_SHARES,
  MIN_SHARE_PRICE,
  operatingSectorIdentity,
} from "@/lib/constants/corporations";
import { logWireEvent, wireHeadlineCorpFounded, wireHeadlineCorpIpo } from "@/lib/wireEvent";
import { computeIpoIssuance } from "@/lib/corporations/ipoIssuance";
import {
  computeFoundingCosts,
  getFoundingFxRate,
  getFoundingConfidenceMultiplier,
} from "@/lib/corporations/foundingCosts";
import { foundingCooldownTurnsRemaining } from "@/lib/corporations/foundingCooldown";
import { getDefaultLegalStructureId } from "@/lib/corporations/legalStructure";
import { readInvestorConfidence } from "@/lib/nationalization/investorConfidence";
import { creditTreasuryProceedsPaired } from "@/lib/nationalization/treasury";
import { emitTx } from "@/lib/financialTxLog/emit";
import { recordAudit } from "@/lib/audit/recordAudit";
import { getGameState } from "@/lib/gameState";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { autoGrantedNodeIds } from "@/lib/constants/techTree";
import { STARTING_YEAR, TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { getPersonalBalance, getHomeCurrency } from "@/lib/currency/characterFunds";
import {
  atomicallyDebitCharacterCash,
  refundCharacterCash,
} from "@/lib/financialTxLog/atomicCashGuard";
import { CURRENCY_SYMBOLS, getSeedCurrencyCode } from "@/lib/constants/currencies";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countries";
import { isPrivateEnterpriseBlocked } from "@/lib/economy/queries/privateEnterpriseGate";
import {
  planEquityPrimaryPlacement,
  prepareEquityPrimaryPlacement,
  refundPreparedEquityPlacement,
  type PreparedEquityPlacement,
} from "@/lib/equities/primaryMarket";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { statesCollection } from "@/lib/db/repositories/states";

export type FoundCorporationRequest = z.infer<typeof foundCorporationSchema>;

export interface FoundCorporationInput {
  db: Db;
  userId: string;
  character: Character;
  request: FoundCorporationRequest;
}

export interface FoundCorporationBody {
  corporationId: string;
  sequentialId: number;
  message: string;
  settlementPending?: true;
}

export type FoundCorporationResult =
  | { ok: false; status: number; error: string; extra?: Record<string, unknown> }
  | { ok: true; status: 201 | 202; body: FoundCorporationBody };

function fail(
  status: number,
  error: string,
  extra?: Record<string, unknown>
): FoundCorporationResult {
  return extra ? { ok: false, status, error, extra } : { ok: false, status, error };
}

/**
 * Found a player corporation: eligibility, era-scaled costs, optional founding
 * IPO (pool placement or a funded underwriter), the founder debit, the
 * corporation insert and its ledger rows. The founder is debited before the
 * insert; any failure after the debit removes the corporation and refunds the
 * founder and the pool, unless an underwriting settlement has started, in which
 * case the shell is kept for journal recovery and the error propagates.
 */
export async function foundCorporation({
  db,
  userId,
  character,
  request,
}: FoundCorporationInput): Promise<FoundCorporationResult> {
  const {
    name,
    tickerSymbol,
    type: lane,
    startingCapital: requestedCapital,
    secondaryType,
    ipo,
  } = request;
  const { sectorType: type, industryModel, mediaDiscriminator } = operatingSectorIdentity(lane);

  // Block founding in command-economy countries (USSR etc.). Reads the
  // marketization dial rather than a static config flag, so a country
  // converting in either direction is honoured without a code change.
  if (await isPrivateEnterpriseBlocked(db, character.countryId)) {
    return fail(
      403,
      "Private corporations cannot be founded in a command economy. The state controls all enterprise."
    );
  }

  // Validate secondary type is distinct from primary
  if (secondaryType !== undefined && secondaryType === lane) {
    return fail(400, "Secondary sector must be different from the primary sector");
  }

  // Starting capital in anchor currency; defaults to baseline if not provided
  // Era money: the fee, the baseline and the capital bounds all deflate
  // together with starting cash, or founding is unreachable in a 1953 world.
  const worldPreset = await getGameStatePresetOrDefault(db);
  const eraBounds = getEraFoundingBounds(worldPreset, {
    fee: CORPORATION_FOUNDING_COST,
    baseline: CORPORATION_STARTING_CAPITAL,
    min: MIN_CORPORATION_STARTING_CAPITAL,
    max: MAX_CORPORATION_STARTING_CAPITAL,
  });
  const startingCapitalAnchor = requestedCapital ?? eraBounds.baseline;

  // Bounds live here, not in the request schema: they depend on the world's
  // era, which the schema layer cannot see. Messages quote the era's own
  // numbers so a 1953 founder is never told to commit a modern amount.
  if (startingCapitalAnchor < eraBounds.min) {
    return fail(400, `Starting capital must be at least ${eraBounds.min.toLocaleString()}`);
  }
  if (startingCapitalAnchor > eraBounds.max) {
    return fail(400, `Starting capital cannot exceed ${eraBounds.max.toLocaleString()}`);
  }

  // HQ defaults to character's home state
  const headquartersState = character.homeState;

  // Keep the one-active-corporation limit account-wide, even when a player
  // switches characters. The cooldown begins only once that corporation ends.
  const existing = await corporationsCollection(db).findOne({
    userId: new ObjectId(userId),
    ceoVacant: { $ne: true },
  });
  if (existing) {
    return fail(400, "You already own a corporation. Each player can own one corporation.");
  }

  // Per-user refounding cooldown, anchored when the previous corporation ends.
  // currentTurnAtFounding is reused below for founding records.
  const foundingGameState = await getGameState();
  const currentTurnAtFounding = foundingGameState?.currentTurn ?? 0;
  const foundingClock = await getGameTime();
  const newFounderBarrier = getNewCorporationFoundingBarrier(
    character,
    currentTurnAtFounding,
    foundingClock.effectiveNow.getTime(),
    foundingGameState?.preIteration?.active === true
  );
  if (newFounderBarrier.blocked) {
    return fail(
      403,
      `New characters can found a corporation after 48 turns. You can found in ${newFounderBarrier.remainingTurns} turn(s).`,
      { remainingTurns: newFounderBarrier.remainingTurns }
    );
  }

  const founderUser = await db
    .collection<User>("users")
    .findOne({ _id: new ObjectId(userId) }, { projection: { lastCorporationFoundedTurn: 1 } });
  const cooldownRemaining = foundingCooldownTurnsRemaining(
    founderUser?.lastCorporationFoundedTurn,
    currentTurnAtFounding
  );
  if (cooldownRemaining > 0) {
    return fail(400, `You can found another corporation in ${cooldownRemaining} turns.`);
  }

  // Check cash on hand (founding costs personal cash, not campaign funds)
  const forexEnabled = await isForexEnabled();
  const homeCurrency = getHomeCurrency(character, worldPreset);

  const corpCountryId = character.countryId as CountryId;
  // Preset-aware: player corps founded in a 2027 euro member stamp EUR, so
  // they match NPP-spawned corps and the seeded EUR exchange rows.
  const corpHomeCurrency: CurrencyCode | undefined = forexEnabled
    ? (getSeedCurrencyCode(corpCountryId, worldPreset) ?? undefined)
    : undefined;
  const underwritingCurrency = (corpHomeCurrency ?? "USD") as CurrencyCode;
  const foundingUnderwriterBank = ipo?.underwriterCorporationId
    ? await (async () => {
        const policy = await loadBankingPolicy(db);
        if (!policy.primaryUnderwriting) return null;
        const bankId = new ObjectId(ipo.underwriterCorporationId);
        const bank = await corporationsCollection(db).findOne(
          {
            _id: bankId,
            "bankCharter.status": "active",
            "bankCharter.type": { $in: ["investment", "universal"] },
            "bankCharter.currency": underwritingCurrency,
            "bankCharter.resolutionClaimedTurn": { $exists: false },
            bankCharterTransfer: { $exists: false },
            bankPrimaryFunding: { $exists: false },
            bankUnderwritingFunding: { $exists: false },
            bankConstructionFunding: { $exists: false },
          },
          {
            projection: {
              _id: 1,
              name: 1,
              countryId: 1,
              liquidCurrencyCode: 1,
              bankCharter: 1,
            },
          }
        );
        return bank && primaryUnderwritingCharterEligible(bank.bankCharter, underwritingCurrency)
          ? bank
          : null;
      })()
    : null;
  if (ipo?.underwriterCorporationId && !foundingUnderwriterBank) {
    return fail(409, "The selected same-currency underwriter is unavailable");
  }
  // Founder charge AND corp seed are both denominated in the corp's local
  // currency. Scaling only the seed (and leaving the charge in ₳) would mint
  // `foundingRate`x free capital for non-USD corps, so computeFoundingCosts
  // converts both legs with the same rate.
  // getFoundingFxRate (stored base rate, never live market rate) is shared with
  // the FoundCorporationModal so the player's preview always matches the
  // charge, and matches migration.ts calibration so corps founded at
  // different exchange levels start equally.
  const foundingRate = getFoundingFxRate(
    corpCountryId,
    forexEnabled,
    await loadCampaignCurrencyRates(db),
    worldPreset
  );
  // Low investor confidence adds a founding premium. The
  // premium is captured by the country treasury (see the credit below); the
  // FoundCorporationModal computes the same multiplier so preview == charge.
  const investorConfidence = await readInvestorConfidence(db, corpCountryId);
  const confidenceMultiplier = getFoundingConfidenceMultiplier(investorConfidence);
  const {
    corpStartingCapital,
    totalPlayerCost,
    extraCapitalOverBaselineAnchor,
    confidencePremiumLocal,
  } = computeFoundingCosts({
    startingCapitalAnchor,
    foundingRate,
    confidenceMultiplier,
    preset: worldPreset,
  });
  // Founding fee + extra commitment in local currency, for the breakdown message.
  const foundingFeeLocal = Math.round(eraBounds.fee * foundingRate);
  const extraCapitalLocal = Math.round(extraCapitalOverBaselineAnchor * foundingRate);
  // Check against home-currency liquid (same bucket we'll deduct from) so we
  // don't pass a player whose wealth is mostly in savings or foreign currency
  // and then drive their liquid GBP negative on deduct.
  const cashOnHand = getPersonalBalance(character, homeCurrency, forexEnabled);
  if (cashOnHand < totalPlayerCost) {
    const sym = CURRENCY_SYMBOLS[homeCurrency] ?? "$";
    return fail(
      400,
      `Insufficient personal funds. Founding this corporation costs ${sym}${totalPlayerCost.toLocaleString()} (${sym}${foundingFeeLocal.toLocaleString()} founding fee + ${sym}${extraCapitalLocal.toLocaleString()} extra treasury${confidencePremiumLocal > 0 ? ` + ${sym}${confidencePremiumLocal.toLocaleString()} low-confidence premium` : ""}). You have ${sym}${Math.floor(cashOnHand).toLocaleString()} liquid. Withdraw savings or trade FX to top up.`
    );
  }

  // Check name uniqueness (case-insensitive)
  const nameTaken = await corporationsCollection(db).findOne({
    name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  });
  if (nameTaken) {
    return fail(400, "A corporation with that name already exists");
  }

  // Check ticker uniqueness: schema already uppercased `tickerSymbol`, so an
  // exact match is sufficient (no collation / regex). The unique partial
  // index closes the residual race between this read and the insert below.
  const tickerTaken = await corporationsCollection(db).findOne({ tickerSymbol });
  if (tickerTaken) {
    return fail(400, "That ticker symbol is already taken");
  }

  const now = new Date();
  const corporationId = new ObjectId();
  const sequentialId = await getNextSequentialId(db, "corporation");
  // Reuse the turn read for the cooldown check above (single game-state read).
  const foundedAtTurn = currentTurnAtFounding;

  // Starting share price scales with how much equity the founder puts in.
  // At baseline ($1M / 10M shares) this equals DEFAULT_SHARE_PRICE ($0.10).
  // sharePrice is stored in the corp's home currency, matching
  // liquidCapital's denomination; divide LOCAL starting capital by shares so
  // non-USD corps don't start with a ₳-denominated share price that would
  // then be misread as LOCAL by downstream turn / display code.
  //
  // The share base deflates with the era for the same reason the treasury
  // does: on a fixed 10M base a 1953 seed prices at $0.0014 and floors at
  // MIN_SHARE_PRICE, opening the corp at ~7x its own treasury.
  const founderShares = getEraFounderShares(CEO_INITIAL_SHARES, worldPreset);
  const initialSharePrice = Math.max(
    MIN_SHARE_PRICE,
    Math.round((corpStartingCapital / founderShares) * 100) / 100
  );

  // If founding via IPO, issue additional shares to the public float at the offering
  // price and add the proceeds to the corp's treasury. Founder keeps their 10M shares
  // but ends up owning <100% of the (larger) total share count.
  const ipoResult = ipo
    ? computeIpoIssuance({
        existingShares: founderShares,
        pricePerShare: initialSharePrice,
        floatPct: ipo.floatPct,
        withSuperShares: ipo.superShareMultiplier !== undefined,
      })
    : null;
  const foundingIssuerSnapshot = capturePrimaryUnderwritingCurrencySnapshot({
    countryId: corpCountryId,
    ...(corpHomeCurrency ? { liquidCurrencyCode: corpHomeCurrency } : {}),
  });
  const foundingBankSnapshot = foundingUnderwriterBank
    ? capturePrimaryUnderwritingCurrencySnapshot(foundingUnderwriterBank)
    : null;
  const foundingOffer: (PrimaryUnderwritingOffer & { instrumentId: ObjectId }) | null =
    ipoResult &&
    foundingUnderwriterBank?.bankCharter &&
    foundingIssuerSnapshot &&
    foundingBankSnapshot
      ? {
          bankCorporationId: foundingUnderwriterBank._id,
          issuerCorporationId: corporationId,
          charteredTurn: foundingUnderwriterBank.bankCharter.charteredTurn,
          currencyCode: underwritingCurrency,
          feeRate: DEFAULT_PRIMARY_UNDERWRITING_FEE_RATE,
          instrumentType: "equity",
          instrumentId: new ObjectId(),
          originalQuoteTurn: foundedAtTurn,
          issuerCurrencySnapshot: foundingIssuerSnapshot,
          bankCurrencySnapshot: foundingBankSnapshot,
        }
      : null;
  if (ipo?.underwriterCorporationId && !foundingOffer) {
    return fail(409, "The selected underwriter's native currency could not be frozen for this IPO");
  }
  const plannedFoundingPlacement =
    ipoResult && foundingOffer
      ? await planEquityPrimaryPlacement(
          db,
          {
            countryId: character.countryId,
            liquidCurrencyCode: corpHomeCurrency,
            totalShares: founderShares,
          },
          ipoResult.newShares,
          initialSharePrice
        )
      : null;
  if (
    plannedFoundingPlacement &&
    (!plannedFoundingPlacement.poolActive || !plannedFoundingPlacement.placedShares)
  ) {
    return fail(
      409,
      "The selected underwriter cannot fund an IPO fill from this market pool right now"
    );
  }
  const foundingPlacement: PreparedEquityPlacement | null = plannedFoundingPlacement
    ? {
        poolActive: true,
        currency: plannedFoundingPlacement.currency,
        requestedShares: plannedFoundingPlacement.requestedShares,
        placedShares: plannedFoundingPlacement.placedShares,
        unsoldShares: plannedFoundingPlacement.unsoldShares,
        paidLocal: plannedFoundingPlacement.plannedGrossLocal,
      }
    : ipoResult
      ? await prepareEquityPrimaryPlacement(
          db,
          {
            countryId: character.countryId,
            liquidCurrencyCode: corpHomeCurrency,
            totalShares: founderShares,
          },
          ipoResult.newShares,
          initialSharePrice,
          now
        )
      : null;
  // Dual-class founding IPO: the founder's initial stake is designated
  // supershares; see lib/corporations/superShares.
  const superShareMultiplier = ipo?.superShareMultiplier;
  const placedIpoShares = foundingOffer ? 0 : (foundingPlacement?.placedShares ?? 0);
  const totalSharesAtFounding = founderShares + placedIpoShares;
  const publicFloatAtFounding = placedIpoShares;
  const liquidCapitalAtFounding =
    corpStartingCapital +
    (foundingPlacement?.poolActive && !foundingOffer ? foundingPlacement.paidLocal : 0);
  const publicSharePriceAtFounding =
    foundingPlacement?.poolActive && !foundingOffer && totalSharesAtFounding > 0
      ? (initialSharePrice * founderShares) / totalSharesAtFounding
      : initialSharePrice;

  // Auto-grant past-decade tech (both Corporate and Sector lanes) so late-founded
  // corps start with all the knowledge of bygone decades, including sector-specific
  // unlock nodes that gate production methods. No lane commitment is recorded for
  // past decades since both lanes are granted; the current decade is chosen normally.
  const techGrant: Partial<Corporation> = {};
  {
    const yearAtFounding =
      foundingGameState?.currentYear ??
      (foundingGameState?.startingYear ?? STARTING_YEAR) +
        Math.floor((Math.max(1, currentTurnAtFounding) - 1) / TURNS_PER_YEAR);
    const grantedIds = autoGrantedNodeIds(lane, yearAtFounding);
    if (grantedIds.length > 0) {
      techGrant.unlockedTechNodeIds = grantedIds;
    }
  }

  const foundingUnderwritingProjection =
    foundingOffer && foundingPlacement && ipoResult
      ? (() => {
          const quote = quotePrimaryUnderwritingFee({
            grossPlacedLocal: foundingPlacement.paidLocal,
            feeRate: foundingOffer.feeRate,
          });
          return {
            collection: "corporations",
            filter: {
              _id: corporationId,
              "foundingIpoUnderwritingPending.offer.instrumentId": foundingOffer.instrumentId,
            },
            pipelineUpdate: [
              {
                $set: {
                  isPrivate: false,
                  hiddenFromExchange: false,
                  legalStructure: getDefaultLegalStructureId(character.countryId, {
                    isPrivate: false,
                  }),
                  lastIpoTurn: foundedAtTurn,
                  totalShares: {
                    $add: [{ $ifNull: ["$totalShares", 0] }, foundingPlacement.placedShares],
                  },
                  publicFloat: {
                    $add: [{ $ifNull: ["$publicFloat", 0] }, foundingPlacement.placedShares],
                  },
                  shareIssuanceProceeds: {
                    $add: [{ $ifNull: ["$shareIssuanceProceeds", 0] }, quote.issuerNetLocal],
                  },
                  sharePrice: {
                    $round: [
                      {
                        $multiply: [
                          { $ifNull: ["$sharePrice", 0] },
                          issuanceDilutionFactorExpr(foundingPlacement.placedShares),
                        ],
                      },
                      4,
                    ],
                  },
                  fundamentalSharePrice: {
                    $round: [
                      {
                        $multiply: [
                          {
                            $ifNull: ["$fundamentalSharePrice", { $ifNull: ["$sharePrice", 0] }],
                          },
                          issuanceDilutionFactorExpr(foundingPlacement.placedShares),
                        ],
                      },
                      4,
                    ],
                  },
                  ...(foundingPlacement.unsoldShares > 0
                    ? {
                        pendingShareIssuance: {
                          remainingShares: foundingPlacement.unsoldShares,
                          requestedShares: ipoResult.newShares,
                          source: "founding_ipo",
                          issuedUpfront: false,
                          createdAtTurn: foundedAtTurn,
                          initialPriceLocal: initialSharePrice,
                          underwriting: foundingOffer,
                        },
                      }
                    : {}),
                  foundingIpoUnderwritingPending: null,
                  updatedAt: now,
                },
              },
            ],
            note: "Publish funded founding IPO shares and net proceeds",
          } satisfies TransitionProjection;
        })()
      : undefined;
  const corporation: Omit<Corporation, "_id"> = {
    name,
    tickerSymbol,
    description: undefined,
    type,
    ...(industryModel ? { industryModel } : {}),
    ...(mediaDiscriminator ? { mediaDiscriminator } : {}),
    ...(secondaryType ? { secondaryType } : {}),
    countryId: character.countryId,
    ceoId: character._id,
    // Explicit: Corporation.ceoType defaults to "character" in docs, but
    // Mongo equality queries (onboarding checklist, buyer-search) do not
    // treat a missing field as that default. Stamp it at founding.
    ceoType: "character",
    ceoVacant: false,
    userId: new ObjectId(userId),
    headquartersState,
    liquidCapital: liquidCapitalAtFounding,
    ...(forexEnabled && corpHomeCurrency ? { liquidCurrencyCode: corpHomeCurrency } : {}),
    marketingBudget: 0,
    marketingStrength: 10,
    logisticsBudget: 0,
    logisticsStrength: 0,
    ceoSalary: 0,
    totalShares: totalSharesAtFounding,
    sharePrice: publicSharePriceAtFounding,
    shareholders: [
      {
        characterId: character._id,
        shares: founderShares,
        avgCostPerShare: totalPlayerCost / foundingRate / founderShares,
        avgCostBasisUnit: "anchor",
        ...(foundingGameState?.stockHoldingTaxStartTurn !== undefined &&
        foundedAtTurn >= foundingGameState.stockHoldingTaxStartTurn
          ? {
              holdingTerms: purchasedHoldingTerms(
                founderShares,
                totalPlayerCost / foundingRate / founderShares,
                foundedAtTurn
              ),
            }
          : {}),
        ...(superShareMultiplier !== undefined ? { superShares: founderShares } : {}),
      },
    ],
    publicFloat: publicFloatAtFounding,
    ...(foundingPlacement?.poolActive && foundingPlacement.paidLocal > 0 && !foundingOffer
      ? { shareIssuanceProceeds: foundingPlacement.paidLocal }
      : {}),
    ...(foundingPlacement && foundingPlacement.unsoldShares > 0 && !foundingOffer
      ? {
          pendingShareIssuance: {
            remainingShares: foundingPlacement.unsoldShares,
            requestedShares: ipoResult!.newShares,
            source: "founding_ipo" as const,
            createdAtTurn: foundedAtTurn,
            initialPriceLocal: initialSharePrice,
          },
        }
      : {}),
    // Every corp gets a colour at founding. It drives the cap-table charts and
    // every place the corp appears next to rivals, and a random pick beats a
    // shared default: two corps side by side are told apart on sight.
    brandColor: randomBrandColor(),
    isPrivate: ipoResult && !foundingOffer ? false : true,
    // Private founding uses the jurisdiction's private form (e.g. UK Ltd),
    // not the public default (PLC); otherwise the hero shows "Private PLC".
    legalStructure: getDefaultLegalStructureId(character.countryId, {
      isPrivate: !ipoResult || !!foundingOffer,
    }),
    foundedAtTurn,
    ...(ipoResult && !foundingOffer ? { lastIpoTurn: foundedAtTurn } : {}),
    ...(foundingOffer
      ? {
          primaryUnderwritingMandate: {
            bankCorporationId: foundingOffer.bankCorporationId,
            charteredTurn: foundingOffer.charteredTurn,
            currencyCode: foundingOffer.currencyCode,
            feeRate: foundingOffer.feeRate,
            selectedAtTurn: foundedAtTurn,
          },
          foundingIpoUnderwritingPending: {
            offer: foundingOffer,
            grossPlacedLocal: foundingPlacement!.paidLocal,
            turn: foundedAtTurn,
            instrumentProjection: foundingUnderwritingProjection!,
          },
        }
      : {}),
    ...(superShareMultiplier !== undefined
      ? { superShareMultiplier, superSharesAdoptedAtTurn: foundedAtTurn }
      : {}),
    sequentialId,
    ...techGrant,
    createdAt: now,
    updatedAt: now,
  };

  // Atomic balance-gated debit on the founder's cash, BEFORE the corp insert:
  // the cashOnHand check above read a cached character doc and cannot close
  // the race. Debit first, insert second, matching the bond/share-buy pattern
  // (cash committed before side effect), so a failed debit never leaves an
  // orphan corp doc.
  const debitResult = await atomicallyDebitCharacterCash(
    db,
    character._id,
    homeCurrency,
    totalPlayerCost,
    forexEnabled
  );
  if (!debitResult.ok) {
    if (foundingPlacement && !foundingOffer) {
      await refundPreparedEquityPlacement(db, foundingPlacement, now);
    }
    const sym = CURRENCY_SYMBOLS[homeCurrency] ?? "$";
    return fail(
      400,
      `Insufficient personal funds. Founding this corporation costs ${sym}${totalPlayerCost.toLocaleString()}.`
    );
  }

  let createdCorporationId: ObjectId | null = null;
  let foundingSettlementStarted = false;
  let foundingSettlementPending = false;
  let foundingSettlementAborted = false;
  try {
    const result = await corporationsCollection(db).insertOne({
      _id: corporationId,
      ...corporation,
    } as Corporation);
    createdCorporationId = result.insertedId;

    if (foundingOffer && foundingUnderwriterBank && foundingUnderwritingProjection) {
      // The private shell and frozen publication plan exist before settlement.
      // If the process stops here, corporation-turn recovery resumes the
      // exact plan; no public shares or proceeds exist until its journal ACKs.
      foundingSettlementStarted = true;
      const settlement = await settlePrimaryUnderwritingFill(db, {
        bank: foundingUnderwriterBank,
        issuer: { _id: result.insertedId, ...corporation },
        issuerCurrencyCode: underwritingCurrency,
        offer: foundingOffer,
        instrumentId: foundingOffer.instrumentId,
        grossPlacedLocal: foundingPlacement!.paidLocal,
        turn: foundedAtTurn,
        now,
        poolCollection: "equityMarketPools",
        instrumentProjection: foundingUnderwritingProjection,
      });
      if (settlement.status === "applied" || settlement.status === "replayed") {
        const quote = quotePrimaryUnderwritingFee({
          grossPlacedLocal: foundingPlacement!.paidLocal,
          feeRate: foundingOffer.feeRate,
        });
        void emitTx(db, {
          type: "ipo_proceeds",
          turn: foundedAtTurn,
          createdAt: now,
          subjectType: "corporation",
          subjectId: result.insertedId,
          subjectName: name,
          amount: quote.issuerNetLocal,
          currencyCode: underwritingCurrency,
          meta: {
            grossPlacedLocal: quote.grossPlacedLocal,
            underwritingFeeLocal: quote.feeLocal,
            sharesPlaced: foundingPlacement!.placedShares,
            sharesRequested: foundingPlacement!.requestedShares,
            sharesPending: foundingPlacement!.unsoldShares,
            counterparty: "equity_market_pool",
          },
        });
      } else if (settlement.status === "rejected" && settlement.appliedLegs.length === 0) {
        await corporationsCollection(db).updateOne(
          {
            _id: result.insertedId,
            "foundingIpoUnderwritingPending.offer.instrumentId": foundingOffer.instrumentId,
          },
          { $unset: { foundingIpoUnderwritingPending: "" }, $set: { updatedAt: now } }
        );
        foundingSettlementStarted = false;
        foundingSettlementAborted = true;
      } else {
        foundingSettlementPending = true;
      }
    }

    // Open the founder's CEO tenure so later departures stamp an endTurn
    // (needed for the former-CEO bond-purchase block).
    await openCeoTenure(db, result.insertedId, {
      holderId: character._id,
      ceoType: corporation.ceoType === "imperial" ? "imperial" : "character",
      turn: foundedAtTurn,
    });

    await charactersCollection(db).updateOne({ _id: character._id }, { $set: { updatedAt: now } });

    // Auto-vote the founder as CEO so the vote record exists from creation
    await db.collection("corporationCeoVotes").insertOne({
      corporationId: result.insertedId,
      voterCharacterId: character._id,
      candidateCharacterId: character._id,
      createdAt: now,
      updatedAt: now,
    });

    // Financial ledger entries for both legs of the founding cash movement
    // (player to corp, plus system grant and founding fee):
    //   - corp_capital_seed on the character: NEGATIVE-amount debit covering
    //     founding fee + extra treasury commitment, counterparty = corporation
    //   - corp_capital_seed on the corp: POSITIVE-amount credit covering the
    //     full starting capital landing in liquidCapital, counterparty = character
    // The delta between the two (= CORPORATION_STARTING_CAPITAL minus the
    // founding fee) represents the system's baseline grant + fee retention,
    // captured in meta for forensics.
    void emitTx(db, {
      type: "corp_capital_seed",
      turn: 0,
      createdAt: now,
      subjectType: "character",
      subjectId: character._id,
      subjectName: character.name,
      amount: -totalPlayerCost,
      currencyCode: homeCurrency,
      counterpartyType: "corporation",
      counterpartyId: result.insertedId,
      counterpartyName: name,
      meta: {
        foundingFee: eraBounds.fee,
        extraCapitalCommitment: extraCapitalOverBaselineAnchor,
        side: "founder_outflow",
      },
    });
    void emitTx(db, {
      type: "corp_capital_seed",
      turn: 0,
      createdAt: now,
      subjectType: "corporation",
      subjectId: result.insertedId,
      subjectName: name,
      amount: corpStartingCapital,
      currencyCode: (corpHomeCurrency as CurrencyCode | undefined) ?? homeCurrency,
      counterpartyType: "character",
      counterpartyId: character._id,
      counterpartyName: character.name,
      meta: {
        startingCapitalAnchor,
        baselineCapital: CORPORATION_STARTING_CAPITAL,
        extraCapitalCommitment: extraCapitalOverBaselineAnchor,
        side: "corp_seed",
      },
    });

    // The low-confidence founding premium is part of totalPlayerCost
    // (already debited from the founder above) but does NOT land in the corp
    // seed. Move it to the country treasury so money is conserved (no burn),
    // and ledger the leg. Zero at/above baseline confidence ⇒ no-op.
    if (confidencePremiumLocal > 0) {
      await creditTreasuryProceedsPaired(db, {
        countryId: corpCountryId,
        amountLocal: confidencePremiumLocal,
        now,
        flow: "founding_confidence_premium",
        key: `founding-premium:${result.insertedId.toHexString()}`,
        site: "foundCorporation.confidencePremium",
      });
      void emitTx(db, {
        type: "corp_capital_seed",
        turn: 0,
        createdAt: now,
        subjectType: "government",
        countryId: corpCountryId,
        subjectName: `${corpCountryId} Treasury`,
        amount: confidencePremiumLocal,
        currencyCode: (corpHomeCurrency as CurrencyCode | undefined) ?? homeCurrency,
        counterpartyType: "character",
        counterpartyId: character._id,
        counterpartyName: character.name,
        meta: {
          side: "founding_confidence_premium",
          investorConfidence,
          confidenceMultiplier,
        },
      });
    }

    if (foundingPlacement?.poolActive && foundingPlacement.paidLocal > 0 && !foundingOffer) {
      void emitTx(db, {
        type: "ipo_proceeds",
        turn: foundedAtTurn,
        createdAt: now,
        subjectType: "corporation",
        subjectId: result.insertedId,
        subjectName: name,
        amount: foundingPlacement.paidLocal,
        currencyCode: (corpHomeCurrency as CurrencyCode | undefined) ?? homeCurrency,
        meta: {
          sharesPlaced: foundingPlacement.placedShares,
          sharesRequested: foundingPlacement.requestedShares,
          sharesPending: foundingPlacement.unsoldShares,
          counterparty: "equity_market_pool",
        },
      });
    }

    const typeLabel = OPERATING_SECTOR_TYPE_LABELS[lane] ?? lane;
    const hqStateDoc = await statesCollection(db).findOne(
      { _id: headquartersState },
      { projection: { name: 1 } }
    );
    const hqDisplayName = hqStateDoc?.name ?? headquartersState;
    logWireEvent("corporation_founded", wireHeadlineCorpFounded(name, typeLabel, hqDisplayName), {
      href: `/corporation/${sequentialId}`,
    });

    recordAudit({
      source: "api",
      action: "corp.found",
      category: "corp",
      actor: {
        kind: "player",
        userId: new ObjectId(userId),
        characterId: character._id,
        name: character.name,
      },
      subject: { type: "corporation", id: result.insertedId, name },
      amount: -totalPlayerCost,
      currencyCode: homeCurrency,
      refs: { corporationId: result.insertedId },
      outcome: "ok",
      meta: { type: lane, headquartersState, isPublicIpo: !!ipoResult },
    });

    if (ipoResult && ipo && !foundingSettlementPending && !foundingSettlementAborted) {
      logWireEvent("corporation_ipo", wireHeadlineCorpIpo(name, ipo.floatPct), {
        href: `/corporation/${sequentialId}`,
      });
    }

    if (foundingSettlementPending) {
      return {
        ok: true,
        status: 202,
        body: {
          corporationId: result.insertedId.toString(),
          sequentialId,
          message: `${name} has been founded privately while its funded IPO settlement completes.`,
          settlementPending: true,
        },
      };
    }
    foundingSettlementStarted = false;
    return {
      ok: true,
      status: 201,
      body: {
        corporationId: result.insertedId.toString(),
        sequentialId,
        message: foundingSettlementAborted
          ? `${name} has been founded privately; the selected bank could not fund the IPO. No public shares or proceeds were issued.`
          : `${name} has been founded!`,
      },
    };
  } catch (error) {
    if (foundingSettlementStarted) {
      // The settlement may have committed one or more cash legs. Keep the
      // frozen shell for journal recovery rather than deleting a paid issuer.
      throw error;
    }
    if (createdCorporationId) {
      await db
        .collection("corporationCeoVotes")
        .deleteMany({ corporationId: createdCorporationId });
      await corporationsCollection(db).deleteOne({ _id: createdCorporationId });
    }
    await refundCharacterCash(db, character._id, homeCurrency, totalPlayerCost, forexEnabled);
    if (foundingPlacement && !foundingOffer) {
      await refundPreparedEquityPlacement(db, foundingPlacement, now);
    }
    // Race-loser path: the pre-check above said the ticker was free, but a
    // concurrent founder won the unique-index insert. Translate to the same
    // 400 the pre-check returns instead of bubbling up a 500.
    const code = (error as { code?: number }).code;
    const msg = error instanceof Error ? error.message : String(error);
    if (code === 11000 && msg.includes("tickerSymbol")) {
      return fail(400, "That ticker symbol is already taken");
    }
    throw error;
  }
}
