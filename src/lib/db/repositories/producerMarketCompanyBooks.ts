import type { Collection, Document } from "mongodb";

import type { CollectionSource } from "./source";

/**
 * Typed handle on the `producerMarketCompanyBooks` collection: each company's
 * part of the funded country books, one document per world, turn and good
 * (`${worldEpoch}:${turn}:${commodity}`). Every read and write of this
 * collection goes through a handle from here; the data access ratchet rejects
 * a direct `.collection("producerMarketCompanyBooks")` anywhere else.
 */
export function producerMarketCompanyBooksCollection<TSchema extends Document = Document>(
  db: CollectionSource
): Collection<TSchema> {
  return db.collection<TSchema>("producerMarketCompanyBooks");
}

/** One company's part of one country's book for one good, per turn. */
export interface ProducerMarketCompanyBookRow {
  countryId: string;
  accountId: string;
  offered: number;
  sold: number;
  requested: number;
  filled: number;
}

export interface ProducerMarketCompanyBooksDoc {
  _id: string;
  worldEpoch: string;
  turn: number;
  commodity: string;
  rows: ProducerMarketCompanyBookRow[];
}

export const companyBooksId = (worldEpoch: string, turn: number, commodity: string) =>
  `${worldEpoch}:${turn}:${commodity}`;

/** Turns kept; older documents are removed when a turn writes its own. */
export const COMPANY_BOOKS_KEPT_TURNS = 3;
