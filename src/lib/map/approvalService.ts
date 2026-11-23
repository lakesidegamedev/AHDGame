import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { BASE_APPROVAL } from "@/lib/utils/governmentApproval";
import { loadStateApprovalsForElection } from "@/lib/utils/getStateApprovalForElection";
import { statesCollection } from "@/lib/db/repositories/states";

export interface MapApprovalState {
  approval: number;
  color: string;
  tooltip: string[];
}

function approvalToHeatColor(approval: number): string {
  const a = Math.max(0, Math.min(100, approval)) / 100;
  return lerpColor("#dc2626", "#22c55e", a);
}

function lerpColor(hex1: string, hex2: string, t: number): string {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export async function computeApprovalMap(
  db: Db,
  countryId: CountryId
): Promise<Record<string, MapApprovalState>> {
  const [allStates, approvals] = await Promise.all([
    statesCollection(db)
      .find({ countryId }, { projection: { _id: 1, name: 1 } })
      .toArray(),
    loadStateApprovalsForElection(db, { countryIds: [countryId] }),
  ]);
  return Object.fromEntries(
    allStates.map((state) => {
      const approval = approvals.get(String(state._id).toUpperCase()) ?? BASE_APPROVAL;
      return [
        state._id,
        {
          approval,
          color: approvalToHeatColor(approval),
          tooltip: [
            state.name ?? String(state._id),
            `Government Approval: ${approval.toFixed(1)}%`,
            "Political performance and regional conditions",
          ],
        },
      ];
    })
  );
}
