import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { stateApprovalHistoryCollection } from "@/lib/db/repositories/stateApprovalHistory";
import { approvalRegionId, regionalApprovalId } from "./rules/regionalIdentity";

/** Called inside the snapshot transaction so interrupted rekeys cannot lose receipts or history. */
export async function prepareRegionalApprovalHistory(db: Db, countryId: CountryId) {
  const collection = stateApprovalHistoryCollection(db);
  const rows = await collection.find({ countryId }).toArray();
  const byRegion = new Map(rows.map((row) => [approvalRegionId(row), row]));
  const legacy = rows.filter(
    (row) => row._id !== regionalApprovalId(countryId, approvalRegionId(row))
  );
  const canonical = new Set(
    rows
      .filter((row) => row._id === regionalApprovalId(countryId, approvalRegionId(row)))
      .map(approvalRegionId)
  );
  if (legacy.length) {
    await collection.bulkWrite(
      legacy.flatMap((row) => {
        const stateId = approvalRegionId(row);
        // Two independent histories cannot be silently discarded or added together.
        if (canonical.has(stateId))
          throw new Error(`Duplicate regional approval history: ${countryId}/${stateId}`);
        return [
          {
            insertOne: {
              document: { ...row, _id: regionalApprovalId(countryId, stateId), stateId },
            },
          },
          { deleteOne: { filter: { _id: row._id, countryId } } },
        ];
      })
    );
  }
  return byRegion;
}
