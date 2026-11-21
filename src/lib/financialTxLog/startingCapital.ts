import type { Db, ObjectId } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { emitTx } from "@/lib/financialTxLog/emit";

export interface StartingCapitalInput {
  characterId: ObjectId;
  characterName: string;
  turn: number;
  /** Currency the personal wallet is keyed under. */
  personalCurrency: CurrencyCode;
  /** Currency the campaign wallet's income rows are emitted in. */
  campaignCurrency: CurrencyCode;
  /** The endowment exactly as written onto the new character document. */
  endowment: { personal?: Partial<Record<CurrencyCode, number>>; campaign?: number } | undefined;
}

/**
 * Witness the endowment written with a new character as a system mint, one row
 * per wallet. Amounts are read back from the document that was inserted, so the
 * ledger can never drift from what the player actually received.
 */
export async function emitStartingCapital(db: Db, input: StartingCapitalInput): Promise<void> {
  const { endowment } = input;
  if (!endowment) return;
  const base = {
    type: "starting_capital" as const,
    turn: input.turn,
    createdAt: new Date(),
    subjectType: "character" as const,
    subjectId: input.characterId,
    subjectName: input.characterName,
  };
  const personal = endowment.personal?.[input.personalCurrency] ?? 0;
  if (personal > 0) {
    await emitTx(db, {
      ...base,
      amount: personal,
      currencyCode: input.personalCurrency,
      meta: { wallet: "personal" },
    });
  }
  const campaign = endowment.campaign ?? 0;
  if (campaign > 0) {
    await emitTx(db, {
      ...base,
      amount: campaign,
      currencyCode: input.campaignCurrency,
      meta: { wallet: "campaign" },
    });
  }
}
