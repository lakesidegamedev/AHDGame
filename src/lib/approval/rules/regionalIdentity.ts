import type { CountryId } from "@/lib/constants/countries";
/** Country-qualified storage keys keep regional histories and receipts separate. */
export const regionalApprovalId = (countryId: string, stateId: string) => `${countryId}:${stateId}`;

export function regionalApprovalFilter(countryId: string, stateId: string) {
  return {
    countryId: countryId as CountryId,
    $or: [{ stateId }, { _id: stateId }, { _id: regionalApprovalId(countryId, stateId) }],
  };
}

export function approvalRegionId(row: { _id: string; stateId?: string }) {
  return row.stateId ?? row._id;
}
