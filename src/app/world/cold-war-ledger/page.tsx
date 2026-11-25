import type { Metadata } from "next";
import { getDb } from "@/lib/mongodb";
import { publicPageMetadata } from "@/lib/siteMetadata";
import { loadWorldAlignment } from "@/lib/alignment/queries/worldAlignment";
import { ColdWarLedgerClient } from "./ColdWarLedgerClient";

export const metadata: Metadata = publicPageMetadata({
  title: "World alignment | A House Divided",
  description:
    "See diplomatic influence across the world, from historical alliances to present-day centers of influence.",
  pathname: "/world/cold-war-ledger",
});

export default async function ColdWarLedgerPage() {
  const db = await getDb();
  const view = await loadWorldAlignment(db);
  return <ColdWarLedgerClient view={view} />;
}
