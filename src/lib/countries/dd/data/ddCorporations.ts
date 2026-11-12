/**
 * DD is a command economy with no private corporations; its producing base is
 * state-owned. This OID trio identifies the bare sovereign issuer, which
 * `seedSovereignBondInstruments` resolves to hang bond tranches off. Without
 * it, seeded DDM debt points at a corporation that does not exist.
 *
 * The issuer is emitted with `sectors: []` and stays the single
 * `isPrimaryNationalCorporation` entity. DD's producing base is a separate
 * stack of one SOE per CorporationType with its own ids; those SOEs are never
 * the primary/issuer corporation.
 */

/** Placeholder ObjectId string for the DD sovereign corporation. */
export const DD_PUBLIC_CORPORATION_OID = "700000000000000000000091";
/** Placeholder ObjectId string for the DD sovereign CEO. */
export const DD_PUBLIC_CEO_OID = "700000000000000000000092";
/** Placeholder ObjectId string for the DD sovereign user. */
export const DD_PUBLIC_USER_OID = "700000000000000000000093";
/** Reserved sequential ID for the DD sovereign corporation. */
export const DD_PUBLIC_SEQUENTIAL_ID = 900_010;
