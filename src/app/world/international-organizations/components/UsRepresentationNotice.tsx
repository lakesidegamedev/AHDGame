import Link from "next/link";
import { cabinetUrl } from "@/lib/urls";
import type { OrgViewerInfo } from "../orgTypes";

export function UsRepresentationNotice({ status }: { status: OrgViewerInfo["usRepresentation"] }) {
  if (!status) return null;

  return (
    <aside className="space-y-1 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
      <h2 className="font-semibold text-foreground">
        {status === "vacant"
          ? "U.S. Secretary of State is vacant"
          : "The U.S. Secretary of State is a non-player character"}
      </h2>
      <p className="text-muted">
        U.S. players can cast votes in these organizations only through a player Secretary of State.
        The President can nominate a player for Senate confirmation or use an acting appointment if
        available.
      </p>
      <Link href={cabinetUrl("US")} className="font-medium text-primary underline">
        Open U.S. Cabinet
      </Link>
    </aside>
  );
}
