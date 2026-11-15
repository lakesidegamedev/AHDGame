/** Deterministic comparison of funded servicing with the legacy duplicate bridge. */
import {
  settleNationalTreasury,
  type NationalTreasuryState,
} from "../../src/lib/resetFinance/rules/settlement";

const results = [false, true].map((funded) => {
  let state: NationalTreasuryState = {
    cash: 0,
    debt: 39e12,
    debtCeiling: 40e12,
    emergencyAdvance: 0,
    arrears: { interest: 0, mandatory: 0, grants: 0, existing: 0, new: 0 },
  };
  let externalFunding = 0;
  let maximumResidual = 0;
  for (let turn = 2; turn <= 40; turn++) {
    const maturity = turn % 12 === 0 ? 4e12 : 0;
    const result = settleNationalTreasury(state, {
      revenue: 100e9,
      annualInterestRate: 0,
      periodsPerYear: 48,
      operatingClaims: { mandatory: 20e9, grants: 25e9, existing: 110e9, new: 0 },
      bondProceeds: 0,
      bondFaceIssued: maturity,
      bondFaceRetired: maturity,
      bondMaturityCashPaid: maturity,
      bondCouponCashPaid: 0,
      bondServiceAlreadyFunded: funded,
      fundOperatingAppropriations: true,
    });
    maximumResidual = Math.max(maximumResidual, Math.abs(result.accountingResidual));
    externalFunding += result.externallyFundedBondCash;
    state = result.closing;
  }
  return { funded, state, externalFunding, maximumResidual };
});
if (results.some((r) => r.maximumResidual !== 0 || r.state.cash !== 0 || r.state.debt !== 39e12))
  throw new Error("Treasury conservation failed");
if (results[0]!.state.emergencyAdvance <= 0 || results[1]!.state.emergencyAdvance !== 0)
  throw new Error("Funded service did not remove only the duplicate bridge");
console.log(
  JSON.stringify(
    { scenario: "39 turns, three quarterly maturities, unchanged authority", results },
    null,
    2
  )
);
