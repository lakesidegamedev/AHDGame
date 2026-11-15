/** Deterministic all-country lean transition qualification. No database access. */
import assert from "node:assert/strict";
import { resetLawFamilies } from "../../src/lib/resetLegislation/catalog";
import { v2VotePosition } from "../../src/lib/resetLegislation/rules/politicalPositions";
import { v2EnactmentApproval } from "../../src/lib/resetLegislation/rules/voterReactions";
import { resetTaxesFor } from "../../src/lib/resetLegislation/taxCatalog";
import { successorTaxTypes } from "../../src/lib/resetLegislation/successorTaxTypes";

let transitions = 0;
const countries = ["US", "UK", "JP", "IE", "SCO", "WAL"] as const;
for (const country of countries)
  for (const family of resetLawFamilies) {
    for (const from of family.levels)
      for (const to of family.levels) {
        const position = v2VotePosition({ familyId: family.id, choice: to.position });
        assert(position);
        for (const axis of ["economic", "social"] as const)
          if (position[axis] !== undefined) {
            assert(Number.isFinite(position[axis]) && Math.abs(position[axis]!) <= 5);
          }
        const provision = {
          familyId: family.id,
          choice: to.position,
          currentChoiceSnapshot: from.position,
        };
        const forward = v2EnactmentApproval([provision], country);
        const reverse = v2EnactmentApproval(
          [{ ...provision, choice: from.position, currentChoiceSnapshot: to.position }],
          country
        );
        for (const [bucket, value] of Object.entries(forward)) {
          assert(Math.abs(value + (reverse[bucket] ?? 0)) < 1e-8);
          assert(Math.abs(value) <= 4);
        }
        transitions++;
      }
  }
for (const country of ["SCO", "WAL"] as const) {
  const taxes = resetTaxesFor(country, "national");
  assert.equal(taxes.length, 11);
  assert(
    taxes.every((tax) =>
      successorTaxTypes.some((type) => type._id === tax.existingLegislationTypeId)
    )
  );
}
console.log(
  JSON.stringify(
    {
      passed: true,
      countries,
      policyFamilies: resetLawFamilies.length,
      transitions,
      successorTaxInstrumentsPerCountry: 11,
      checks: [
        "finite bounded leans",
        "reversible bounded approval",
        "independent tax catalog coverage",
      ],
    },
    null,
    2
  )
);
