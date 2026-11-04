/**
 * One shared replacement bond per issuer, currency, coupon, term and turn for
 * the three maturity refinancing paths (public-float novation, forced pool
 * rollover and the refunding issue).
 *
 * Without it each path inserts its own bond for every maturing bond, so one
 * maturity turn of N bonds issues up to 3N new bonds that all mature together
 * a term later. Measured: 9,460 bonds maturing on one turn were refinanced
 * into 25,976 replacements, every one due on the same later turn. Folding the
 * replacements into one document per (issuer, currency, coupon, term, turn)
 * keeps the debt, the units and the money identical while the next maturity
 * turn settles a handful of bonds per issuer instead of thousands.
 *
 * The id is derived from that identity, so every writer of the same turn and
 * coupon lands on the same document, and the units arrive by `$inc` inside the
 * writer's own transaction or settlement receipt, which already carries the
 * one-shot guard that keeps a replay from adding them twice.
 *
 * Gated by `gameConfig.sovereignRolloverConsolidationEnabled`; off keeps one
 * replacement bond per maturing claim exactly as before.
 */
import type { ObjectId } from "mongodb";
import type { Bond } from "@/lib/db/types";
import { BOND_UNIT_FACE_VALUE, type BondMaturityTurns } from "@/lib/db/types/bond";
import type { CountryId } from "@/lib/constants/countries";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { primaryDocumentId } from "./sovereignPrimarySettlement";

export interface SovereignRolloverBondIdentity {
  countryId: CountryId;
  currencyCode: CurrencyCode;
  issuerName: string;
  corporationId: ObjectId;
  couponRate: number;
  maturityTurns: BondMaturityTurns;
  issuedAtTurn: number;
}

/** The shared replacement bond's id for one issuer, currency, coupon, term and turn. */
export function sovereignRolloverBondId(identity: SovereignRolloverBondIdentity): ObjectId {
  return primaryDocumentId(
    [
      "sovereign-rollover",
      identity.countryId,
      identity.currencyCode,
      identity.issuedAtTurn,
      identity.maturityTurns,
      String(identity.couponRate),
    ].join(":")
  );
}

/**
 * Every field of a fresh shared replacement bond except the amounts, which
 * writers add with `$inc`. Used as `$setOnInsert`, so the first writer of the
 * turn creates the document and later writers only add units.
 */
export function sovereignRolloverBondShell(
  identity: SovereignRolloverBondIdentity,
  now: Date
): Omit<Bond, "_id" | "totalIssued" | "publicFloat" | "requestedUnits"> {
  return {
    issuerType: "sovereign",
    corporationId: identity.corporationId,
    countryId: identity.countryId,
    issuerName: identity.issuerName,
    faceValue: BOND_UNIT_FACE_VALUE,
    couponRate: identity.couponRate,
    maturityTurns: identity.maturityTurns,
    issuedAtTurn: identity.issuedAtTurn,
    maturityTurn: identity.issuedAtTurn + identity.maturityTurns,
    marketPrice: 1,
    holders: [],
    defaulted: false,
    defaultedAtTurn: null,
    matured: false,
    restructureHaircutPercent: null,
    restructureExtendedMaturityTurn: null,
    originalMaturityTurn: null,
    originalTotalIssued: null,
    currencyCode: identity.currencyCode,
    unsoldUnits: 0,
    primaryFillRatio: 1,
    sovereignRolloverConsolidated: true,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The upsert that adds `units` of pool-held float to the shared replacement
 * bond, creating it on the first write of the turn.
 */
export function sovereignRolloverBondUpsert(
  identity: SovereignRolloverBondIdentity,
  units: number,
  now: Date
): {
  filter: { _id: ObjectId };
  update: Record<string, unknown>;
} {
  if (!Number.isSafeInteger(units) || units <= 0)
    throw new Error("Sovereign rollover units must be a positive whole number");
  const { updatedAt: _updatedAt, ...shell } = sovereignRolloverBondShell(identity, now);
  void _updatedAt;
  return {
    filter: { _id: sovereignRolloverBondId(identity) },
    update: {
      $inc: {
        totalIssued: units * BOND_UNIT_FACE_VALUE,
        publicFloat: units,
        requestedUnits: units,
      },
      $setOnInsert: shell,
      $set: { updatedAt: now },
    },
  };
}
