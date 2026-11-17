/**
 * Unmet local healthcare demand spills one hop to neighbouring states.
 *
 * Visits sell in the state where they are produced, so a state with no
 * hospital has funded demand nobody can serve while a neighbour's hospitals
 * sit part empty. A flagged order, once its own book has cleared, may buy the
 * leftover supply in adjacent states of its own country. Plain data in, plain
 * data out.
 */
import type { CommodityType } from "@/lib/constants/commodities";
import type { CountryId } from "@/lib/constants/countries";
import { adjacentStates } from "@/lib/constants/stateAdjacency";
import type { PurchaseOrder } from "./producerQuotes";

export const SPILLING_STATE_COMMODITIES: readonly CommodityType[] = ["healthcare_services"];

const STATE_BOOK = "state:";

/** Neighbour books of a state book in a country; empty for any other book. */
export function spillBooksFor(book: string, countryId: string): string[] {
  if (!book.startsWith(STATE_BOOK)) return [];
  const own = book.slice(STATE_BOOK.length);
  return adjacentStates(countryId as CountryId, own)
    .filter((id) => id !== own)
    .map((id) => `${STATE_BOOK}${id}`)
    .sort();
}

/** Flag spilling-commodity state-book orders with their neighbour books. Mutates and returns the orders. */
export function markStateServiceSpill<T extends PurchaseOrder>(orders: T[]): T[] {
  for (const order of orders) {
    if (!order.countryId) continue;
    if (!SPILLING_STATE_COMMODITIES.includes(order.commodity as CommodityType)) continue;
    const books = spillBooksFor(order.book, order.countryId);
    if (books.length > 0) order.spillBooks = books;
  }
  return orders;
}
