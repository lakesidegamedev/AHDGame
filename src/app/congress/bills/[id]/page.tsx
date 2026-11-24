import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getAuthUser } from "@/lib/auth";
import { getNationalBillDetail } from "@/lib/legislature/queries/nationalBillQueries";
import BillDetailClient from "./BillDetailClient";
import type { BillDetail } from "./types";

// Per-viewer: the detail carries the viewer's own vote and controls, so this
// render must never be cached or shared between viewers.
export const dynamic = "force-dynamic";

/**
 * Loads the bill on the server so the first paint is real content instead of a
 * skeleton plus a client round trip. A failure is not fatal: the client falls
 * back to its own fetch and error state.
 */
export default async function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let initialBill: BillDetail | null = null;
  if (ObjectId.isValid(id)) {
    try {
      const [db, authUser] = await Promise.all([getDb(), getAuthUser().catch(() => null)]);
      const bill = await getNationalBillDetail(db, id, authUser);
      // Same JSON shape the API returns (Dates as strings, ids as strings).
      if (bill) initialBill = JSON.parse(JSON.stringify(bill)) as BillDetail;
    } catch {
      initialBill = null;
    }
  }
  return <BillDetailClient initialBill={initialBill} />;
}
