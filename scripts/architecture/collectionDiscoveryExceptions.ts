/**
 * Exact baselines for existing broad-string collection selectors. Every entry
 * binds one call expression to its owning function body and occurrence count.
 * A source edit or a new selector requires a fresh review and a narrower type
 * where practical. These records document existing dynamic sites; they do not
 * make newly discovered call sites acceptable.
 */
export interface LegacyDynamicCollectionSite {
  file: string;
  owner: string;
  argument: string;
  scopeHash: string;
  count: number;
  reason: string;
}

export const LEGACY_DYNAMIC_COLLECTION_SITES: readonly LegacyDynamicCollectionSite[] = [
  {
    file: "src/lib/congress/clearWhippedVote.ts",
    owner: "clearWhippedFromVote",
    argument: "collectionName",
    scopeHash: "11456fe5a61b8d3405277ac31293d415623d156b5a24d4cafbdbd49d02aa6da2",
    count: 1,
    reason:
      "Callers pass the voting collection name for the whipped-vote badge reset; every caller supplies a name already scanned at its own repository.",
  },
  {
    file: "src/app/api/admin/leadership-elections/route.ts",
    owner: "handleUSCancel",
    argument: "electionsCollection",
    scopeHash: "30da43c7d9467ede39b75fe7e517ea590cff4f8fa78950ef99310c78dad31451",
    count: 1,
    reason: "The admin route selects from the repository-owned election or index configuration.",
  },
  {
    file: "src/app/api/admin/leadership-elections/route.ts",
    owner: "handleUSCancel",
    argument: "nominationsCollection",
    scopeHash: "30da43c7d9467ede39b75fe7e517ea590cff4f8fa78950ef99310c78dad31451",
    count: 1,
    reason: "The admin route selects from the repository-owned election or index configuration.",
  },
  {
    file: "src/app/api/admin/leadership-elections/route.ts",
    owner: "handleUSFail",
    argument: "electionsCollection",
    scopeHash: "779ed85169589bb9e535126d50a1332972a1a605ec9050d1d41d85b12a4a3ab9",
    count: 1,
    reason: "The admin route selects from the repository-owned election or index configuration.",
  },
  {
    file: "src/app/api/admin/leadership-elections/route.ts",
    owner: "handleUSFail",
    argument: "nominationsCollection",
    scopeHash: "779ed85169589bb9e535126d50a1332972a1a605ec9050d1d41d85b12a4a3ab9",
    count: 1,
    reason: "The admin route selects from the repository-owned election or index configuration.",
  },
  {
    file: "src/app/api/admin/leadership-elections/route.ts",
    owner: "handleUSPass",
    argument: "electionsCollection",
    scopeHash: "00b0b77f6cda2325de9812b1968941095a7964eab2ab7cf88cb4de66026e322a",
    count: 1,
    reason: "The admin route selects from the repository-owned election or index configuration.",
  },
  {
    file: "src/app/api/admin/leadership-elections/route.ts",
    owner: "handleUSPass",
    argument: "nominationsCollection",
    scopeHash: "00b0b77f6cda2325de9812b1968941095a7964eab2ab7cf88cb4de66026e322a",
    count: 3,
    reason: "The admin route selects from the repository-owned election or index configuration.",
  },
  {
    file: "src/app/api/admin/migrations/create-indexes/diagnose/route.ts",
    owner: "getExistingKeys",
    argument: "collection",
    scopeHash: "64d9564918ea45a010166a566c77ad7b856753d658514a88ff54131bc2d94909",
    count: 1,
    reason: "The admin route selects from the repository-owned election or index configuration.",
  },
  {
    file: "src/app/api/admin/migrations/create-indexes/route.ts",
    owner: "POST",
    argument: "collection",
    scopeHash: "d59a859449ea90946113115524f485d6dcb1588a7288e4e0381bdf59b7d0f9c5",
    count: 1,
    reason: "The admin route selects from the repository-owned election or index configuration.",
  },
  {
    file: "src/lib/admin/resetContract/applyPreservedFieldContracts.ts",
    owner: "applyPreservedFieldContracts",
    argument: "name",
    scopeHash: "8a2121fca29330f95b1e2701f72e1ae2f99d7bad589b140fc1f469f9c8a03fdd",
    count: 1,
    reason: "Reset iterates the preserved-field contract, which mirrors the seed manifest.",
  },
  {
    file: "src/lib/admin/resetContract/residueScan.ts",
    owner: "runResidueScan",
    argument: "collection",
    scopeHash: "a25f91bdd344460ce3be28aea591bd9e8cd76f54d32696490771dca8290046dd",
    count: 3,
    reason: "The residue scan reads the manifest categories and its own fixed turn-stamp list.",
  },
  {
    file: "src/lib/admin/resetGameWorld.ts",
    owner: "<anonymous-function>",
    argument: "name",
    scopeHash: "5bb243b52a536dec4734a3aa778d6eeb25f29fbeb3765bb3e12ddc8e02f4a792",
    count: 1,
    reason: "Reset iterates the explicit runtime manifest.",
  },
  {
    file: "src/lib/admin/seed/indexes/helpers.ts",
    owner: "ensureIndex",
    argument: "collection",
    scopeHash: "956b950eb4e3738640873e63fbbff31b511eca62d95a9341651b25079e7afd5c",
    count: 4,
    reason: "Repository-owned seed and index registries select the collection.",
  },
  {
    file: "src/lib/admin/seed/indexes/plan.ts",
    owner: "findMissingSeedIndexes",
    argument: "name",
    scopeHash: "cb2b2ec883f15af39107fb6996e7a1de4be0ff00943c8a797e4bc35f70165b32",
    count: 1,
    reason: "Repository-owned seed and index registries select the collection.",
  },
  {
    file: "src/lib/admin/seed/referenceRebuildClear.ts",
    owner: "clearReferenceForRebuild",
    argument: "name",
    scopeHash: "e36502ec4823f82fae3e947f38dd3108ebc043f174fb604cc0bd17a5d65f0da5",
    count: 1,
    reason: "Repository-owned seed and index registries select the collection.",
  },
  {
    file: "src/lib/admin/seed/runCoreSeed.ts",
    owner: "runSeed",
    argument: "entry.name",
    scopeHash: "98bd29dbb249fd0d555985717c1dcfc2d07da2588071fa3fe759e208e2446ccb",
    count: 1,
    reason:
      "Reviewed county reseed compatibility: only the literal states update now preserves live population, and the US census lean seeding no longer stores group rows. The reset filter no longer special-cases the retired voter-group category collection. Reviewed rebase: preset forwarding changed; the existing reset entry.name selector, registry, filters and dynamic call count are unchanged; no new dynamic collection scope is permitted.",
  },
  {
    file: "src/lib/admin/seed/seedRegionMetrics.ts",
    owner: "seedRegionMetrics",
    argument: "collection",
    scopeHash: "207d1592f03e0f50709db0a86a4eefa0b38c541e5e18e4d09974573e87657b0e",
    count: 1,
    reason: "Repository-owned seed and index registries select the collection.",
  },
  {
    file: "src/lib/admin/seedDiagnostic/conformance.ts",
    owner: "checkEmptyPoliticalStart",
    argument: "collection",
    scopeHash: "b6a33f66e758d6f6d3d7fbb2bc1684b6cd647c77b6a6fb32b702b21059e35f25",
    count: 1,
    reason:
      "Reviewed rebase of the read-only 2027 starting cleanup: upstream repository getters replace literal reads. The existing political collection registry and country filters remain unchanged; No NPPs skips the shared retained-party set. No new dynamic collection scope is permitted.",
  },
  {
    file: "src/lib/admin/seedDiagnostic/conformance.ts",
    owner: "checkRuntimeCleanliness",
    argument: "name",
    scopeHash: "3005014d59768ccf83e4ff6c783c32af57403c7075dc3df28a90471c2d2ac910",
    count: 1,
    reason: "Repository-owned seed and index registries select the collection.",
  },
  {
    file: "src/lib/admin/seedDiagnostic/regionDerivedCoverage.ts",
    owner: "<anonymous-function>",
    argument: "collection",
    scopeHash: "6e8c184df5dd0329efed664752e70c5c5b23b7b4b2ddbe61d3a69329ab79b8a6",
    count: 1,
    reason: "Repository-owned seed and index registries select the collection.",
  },
  {
    file: "src/lib/admin/startingParties.ts",
    owner: "clearStartingPolitics",
    argument: "collection",
    scopeHash: "5c0d45eff13bdccb41e7886c712e71becd64922909898e5e2a98723accbf2b49",
    count: 1,
    reason:
      "Reviewed rebased 2027 starting conditions and repository getter migration: the existing reset-only political registry and country filters are unchanged. No NPPs skips the four named party collections, preserving their reference lifecycle. New district-holder and party-officer clears use literal collections; no new dynamic target is permitted.",
  },
  {
    file: "src/lib/admin/startingParties.ts",
    owner: "startingArtifactFilters",
    argument: "link.parent",
    scopeHash: "3b0573ebc0c1c12d86853fe58b04678191036bdaa0945ca20611720dc379f221",
    count: 1,
    reason:
      "The named persistence operation receives its collection from a repository-owned caller.",
  },
  {
    file: "src/lib/banking/atomicDocumentSettlement.ts",
    owner: "resumeAtomicDocumentSettlement",
    argument: "plan.collection",
    scopeHash: "a0cac859223df2a6ceb00bc30219ccdf4472567e636bb97f7724d335612c2a20",
    count: 1,
    reason: "The persisted transaction or recovery record carries its destination collection.",
  },
  {
    file: "src/lib/banking/atomicDocumentSettlement.ts",
    owner: "settleAtomicDocumentTransition",
    argument: "projection.collection",
    scopeHash: "d866520ac2728bedb0b7e6171265146a6a966bbcff65b4d3f11952f3204bb937",
    count: 1,
    reason: "The persisted transaction or recovery record carries its destination collection.",
  },
  {
    file: "src/lib/banking/fundedSovereignCoupons.ts",
    owner: "loadCouponTargetReadiness",
    argument: "collection",
    scopeHash: "9eb086542e872472efafef81247814572a5899098eaba64a0a9e58b1716eb11c",
    count: 1,
    reason: "The persisted transaction or recovery record carries its destination collection.",
  },
  {
    file: "src/lib/banking/recovery.ts",
    owner: "existingTargetIds",
    argument: "collection",
    scopeHash: "a20eecd22c12debe43922f58d945d828b4f8e6cd5b733502035f4fd0b64bd51c",
    count: 1,
    reason: "The recovery worker checks the destinations a persisted money move names.",
  },
  {
    file: "src/lib/banking/moneyMove.ts",
    owner: "acknowledgeLeg",
    argument: "collection",
    scopeHash: "35a1ad6e23fc882ef2cabb635ab6ea774889d987022572a23627c32c51f9e64a",
    count: 1,
    reason: "The persisted transaction or recovery record carries its destination collection.",
  },
  {
    file: "src/lib/banking/moneyMove.ts",
    owner: "applyLeg",
    argument: "leg.collection",
    scopeHash: "d685431760a4f6678153bbc55674370127b9af3cb0d0e0d60c4c6e3b99bcb5c1",
    count: 1,
    reason: "The persisted transaction or recovery record carries its destination collection.",
  },
  {
    file: "src/lib/banking/moneyMove.ts",
    owner: "applyMoneyMove",
    argument: "leg.collection!",
    scopeHash: "af446333d75b07ba36f26bf60e70b1bbdb0721a55518880a07a45c9cdcbe114e",
    count: 1,
    reason: "The persisted transaction or recovery record carries its destination collection.",
  },
  {
    file: "src/lib/banking/moneyMove.ts",
    owner: "deliverCashLegsInBatch",
    argument: "collection",
    scopeHash: "4eb839cee5e0b189df3cb6f5b4ae234394bb60e49bf90c0b47eb2e8433727c30",
    count: 1,
    reason: "The persisted transaction or recovery record carries its destination collection.",
  },
  {
    file: "src/lib/banking/projectionSettlement.ts",
    owner: "acknowledge",
    argument: "collection",
    scopeHash: "8654c772ce7d95c4f89396fcb938926fce98da68596aeb1922e7283052280494",
    count: 1,
    reason: "The persisted transaction or recovery record carries its destination collection.",
  },
  {
    file: "src/lib/banking/projectionSettlement.ts",
    owner: "applyProtectedProjection",
    argument: "projection.collection",
    scopeHash: "9c50eae12a575c7770e9a8c3e058de50e33776e11fdeb0af54f497af16bc037c",
    count: 1,
    reason: "The persisted transaction or recovery record carries its destination collection.",
  },
  {
    file: "src/lib/banking/projectionSettlement.ts",
    owner: "bindProjectionTargets",
    argument: "projection.collection",
    scopeHash: "82f8ac96803f76067a2f16c18f4dff5401c495a557b21e3df1942baa7576b8b1",
    count: 1,
    reason: "The persisted transaction or recovery record carries its destination collection.",
  },
  {
    file: "src/lib/banking/settlementJournal.ts",
    owner: "applyProjection",
    argument: "projection.collection",
    scopeHash: "cf6a131b905bebdefb628159f96f386ceb10c2ad16e7d0df07f3a2c67ee9c70f",
    count: 1,
    reason: "The persisted transaction or recovery record carries its destination collection.",
  },
  {
    file: "src/lib/corporations/commands/acquisitions/acquisitionSettlement.ts",
    owner: "applyAcquisitionLeg",
    argument: "leg.collection",
    scopeHash: "0ca6c157583b0846a2da2d02e66888e50bcd2f89bf106105a92083ad54c2bfa8",
    count: 1,
    reason:
      "Reviewed corporate-tax priority guard: fresh acquirer debits reject pending withholding and existing payables; persisted acquisition legs still target only characters, imperialCharacters or corporations, retain their keyed wallet recovery, and inherit actor reset coverage.",
  },
  {
    file: "src/lib/corporations/commands/acquisitions/acquisitionSettlement.ts",
    owner: "reconcileLandedLegs",
    argument: "leg.collection",
    scopeHash: "8cb1788acd11977d65439396a6d1d7c1cd72d502a7075271bbd5bc1bca881124",
    count: 1,
    reason: "The persisted transaction or recovery record carries its destination collection.",
  },
  {
    file: "src/lib/countries/jp/elections/shugiinFilingIndexes.ts",
    owner: "<anonymous-function>",
    argument: "collection",
    scopeHash: "8a8285f9b9b9e1ad3f3a829ba1b4025fa65f77b9b609e3971fad7ef0c14d7c83",
    count: 1,
    reason:
      "The country-specific operation selects among repository-owned collection configuration.",
  },
  {
    file: "src/lib/countries/ru/ruConvocation.ts",
    owner: "handleRuConvocationReset",
    argument: "collection",
    scopeHash: "1b4c33744c4c94d73a3151b0f4a57baf3ec813961b9804ebb7aff595e6bf82e0",
    count: 1,
    reason:
      "The country-specific operation selects among repository-owned collection configuration.",
  },
  {
    file: "src/lib/country/mergeCountry.ts",
    owner: "sweepNationalStrays",
    argument: "collection",
    scopeHash: "ce144eca417d0a85dd587fe7a9edee0af30477d24b9821450f5cf701fe8e4d44",
    count: 1,
    reason: "The world-transition operation iterates its explicit collection descriptors.",
  },
  {
    file: "src/lib/country/mergePartiesIntoCountry.ts",
    owner: "mergePartiesIntoCountry",
    argument: "ref.collection",
    scopeHash: "dc0d36f13be1f05b222c0d06851ee793c60a27db569e8d0f0fc54b181fdbace3",
    count: 5,
    reason: "The world-transition operation iterates its explicit collection descriptors.",
  },

  {
    file: "src/lib/indexFunds/fundFloatSettlement.ts",
    owner: "<anonymous-function>",
    argument: "...args",
    scopeHash: "57fcec3e4377aefc73d3f959743b13e39eb29fe834238f6af269bbf7cb0172e6",
    count: 1,
    reason: "The persisted transaction or recovery record carries its destination collection.",
  },
  {
    file: "src/lib/internationalOrganizations/cashLedger.ts",
    owner: "settleOrganizationFundedCashMove",
    argument: "input.destination.collection",
    scopeHash: "07d2efe40aa5441d53b7b27e024063c45c2963ee7633d3877f57bd23ec139ab1",
    count: 1,
    reason: "The persisted transaction or recovery record carries its destination collection.",
  },
  {
    file: "src/lib/internationalOrganizations/cashLedger.ts",
    owner: "settleOrganizationFundedCashMove",
    argument: "input.source.collection",
    scopeHash: "07d2efe40aa5441d53b7b27e024063c45c2963ee7633d3877f57bd23ec139ab1",
    count: 1,
    reason: "The persisted transaction or recovery record carries its destination collection.",
  },
  {
    file: "src/lib/lineOfCredit/settlement.ts",
    owner: "resumeLocRecord",
    argument: "row.collection",
    scopeHash: "674dffe87b99d5f0470103b896e48ca3598712958fc551c23740da116b606c94",
    count: 1,
    reason: "The persisted transaction or recovery record carries its destination collection.",
  },
  {
    file: "src/lib/migrations/entries/2026-06-01-index-fund-foundation.ts",
    owner: "reconcileIndex",
    argument: "plan.collection",
    scopeHash: "b62f4767870dd665c405e1a0d6dce5d34b0195a1842621a22c03582f71c3fdf7",
    count: 1,
    reason:
      "Checked-in migration descriptors own the target collection for one-off index or schema work.",
  },
  {
    file: "src/lib/migrations/entries/2026-07-01-union-indexes.ts",
    owner: "createPlannedIndexes",
    argument: "dropped.collection",
    scopeHash: "2620ae66190368acff47348dd4419fbc2a5776fe910b0138d6c8b3f1f11ced2b",
    count: 1,
    reason:
      "Checked-in migration descriptors own the target collection for one-off index or schema work.",
  },
  {
    file: "src/lib/migrations/entries/2026-07-01-union-indexes.ts",
    owner: "createPlannedIndexes",
    argument: "plan.collection",
    scopeHash: "2620ae66190368acff47348dd4419fbc2a5776fe910b0138d6c8b3f1f11ced2b",
    count: 1,
    reason:
      "Checked-in migration descriptors own the target collection for one-off index or schema work.",
  },
  {
    file: "src/lib/migrations/entries/2026-08-31-intelligence-indexes.ts",
    owner: "execute",
    argument: "plan.collection",
    scopeHash: "359568d25c88efe8236d026b6fade60d4de0c26f0e19cf404c413082d2003e48",
    count: 1,
    reason:
      "Checked-in migration descriptors own the target collection for one-off index or schema work.",
  },
  {
    file: "src/lib/migrations/entries/2026-09-09-unique-voting-party-elections.ts",
    owner: "createPlannedIndexes",
    argument: "plan.collection",
    scopeHash: "b62f68eec273b003a1ad3a34d4457f5b88371edfabb6075b749c40030e0130d3",
    count: 2,
    reason:
      "Checked-in migration descriptors own the target collection for one-off index or schema work.",
  },
  {
    file: "src/lib/migrations/entries/2026-09-11-source-fence-indexes.ts",
    owner: "apply",
    argument: "plan.collection",
    scopeHash: "be3f67585e110c4949828ca1784c52adb3e47931a34f818c9bcac6672e02889b",
    count: 2,
    reason:
      "Checked-in migration descriptors own the target collection for one-off index or schema work.",
  },
  {
    file: "src/lib/migrations/entries/2026-09-26-market-chart-indexes.ts",
    owner: "execute",
    argument: "spec.collection",
    scopeHash: "5bf0b0262b16ea9bc0e9d6eb985507a4ced3423cdeb6554921bf9061cc8f2402",
    count: 1,
    reason:
      "Checked-in migration descriptors own the target collection for one-off index or schema work.",
  },
  {
    file: "src/lib/migrations/entries/2026-10-01-reconcile-seed-indexes.ts",
    owner: "duplicateKeyCount",
    argument: "entry.collection",
    scopeHash: "44c8509211afd712fd5937811b43fd3e9365083436be9211286775a11f82aa90",
    count: 1,
    reason:
      "Checked-in migration descriptors own the target collection for one-off index or schema work.",
  },
  {
    file: "src/lib/migrations/entries/2026-10-01-reconcile-seed-indexes.ts",
    owner: "execute",
    argument: "entry.collection",
    scopeHash: "3334492a5735dc989862818f50a584c4e960a2af91e361ba9e8bbecca2318bef",
    count: 1,
    reason:
      "Checked-in migration descriptors own the target collection for one-off index or schema work.",
  },
  {
    file: "src/lib/migrations/entries/2026-10-04-political-media-order-indexes.ts",
    owner: "execute",
    argument: "index.collection",
    scopeHash: "8e2fa4958878aa272adf8faa7ffd835237eb6d44e01c96463c9949ae2e32a7bf",
    count: 1,
    reason:
      "Checked-in migration descriptors own the target collection for one-off index or schema work.",
  },
  {
    file: "src/lib/propagateNameChange.ts",
    owner: "<anonymous-function>",
    argument: "col",
    scopeHash: "5dcd865dab88a1fe7646190c872cca67f30d8182316068a074ed7956da4e191b",
    count: 2,
    reason:
      "The named persistence operation receives its collection from a repository-owned caller.",
  },

  {
    file: "src/lib/remediation/adhoc.ts",
    owner: "apply",
    argument: "spec.collection",
    scopeHash: "dd39137c32cf96c19561d8d4c2221c8c7ba8536d6166da9a0d18920abe850572",
    count: 2,
    reason:
      "Authenticated operator remediation specs select the collection for a reviewed repair operation.",
  },
  {
    file: "src/lib/remediation/adhoc.ts",
    owner: "detect",
    argument: "spec.collection",
    scopeHash: "2b4524ac15edc35c20a9956da32becfa346f9bc17a9d8d14451f3a44abdeed19",
    count: 1,
    reason:
      "Authenticated operator remediation specs select the collection for a reviewed repair operation.",
  },
  {
    file: "src/lib/remediation/adhoc.ts",
    owner: "matchIds",
    argument: "spec.collection",
    scopeHash: "cec20162cb4689ebda1189ac9be39acf7fac460d9aed31e1285d8d26d236e8bc",
    count: 1,
    reason:
      "Authenticated operator remediation specs select the collection for a reviewed repair operation.",
  },
  {
    file: "src/lib/remediation/adhoc.ts",
    owner: "verify",
    argument: "spec.collection",
    scopeHash: "5b9f123cc96862b2be86b817f8c83bd166269affa16c275524c58c10d3e2d319",
    count: 2,
    reason:
      "Authenticated operator remediation specs select the collection for a reviewed repair operation.",
  },
  {
    file: "src/lib/remediation/backup.ts",
    owner: "rollback",
    argument: "backup.collection",
    scopeHash: "9b1caf5caa2f03bb2f8f6f961a6e691033127c275a9c3eb232fc35adafd27b42",
    count: 1,
    reason:
      "Authenticated operator remediation specs select the collection for a reviewed repair operation.",
  },
  {
    file: "src/lib/remediation/backup.ts",
    owner: "rollback",
    argument: "entry.collection",
    scopeHash: "9b1caf5caa2f03bb2f8f6f961a6e691033127c275a9c3eb232fc35adafd27b42",
    count: 1,
    reason:
      "Authenticated operator remediation specs select the collection for a reviewed repair operation.",
  },
  {
    file: "src/lib/remediation/backup.ts",
    owner: "snapshot",
    argument: "entry.collection",
    scopeHash: "9175b1b3200ab007efdfcaf4c095f26b6f4b1f5670a3d32df7e0b22dd5439564",
    count: 1,
    reason:
      "Authenticated operator remediation specs select the collection for a reviewed repair operation.",
  },
  {
    file: "src/lib/remediation/inspect.ts",
    owner: "worker",
    argument: "names[i]",
    scopeHash: "f3e4532956c08ecaafe8b2ec286cd27be32f345298c8885957270169a57f60c4",
    count: 1,
    reason:
      "Collection names come from the database's own listCollections result, counted read-only.",
  },
  {
    file: "src/lib/remediation/inspect.ts",
    owner: "runCount",
    argument: "collection",
    scopeHash: "4c410412d92f0813f74070cc0e5d085a793b9b76befdbf4b64eac4d9fb99e26d",
    count: 1,
    reason:
      "Authenticated operator remediation specs select the collection for a reviewed repair operation.",
  },
  {
    file: "src/lib/remediation/inspect.ts",
    owner: "runDistinct",
    argument: "collection",
    scopeHash: "1975b6fa3d201ca052120bf831b1a476d1b4831684530cc39869f0c5de8075f0",
    count: 1,
    reason:
      "Authenticated operator remediation specs select the collection for a reviewed repair operation.",
  },
  {
    file: "src/lib/remediation/inspect.ts",
    owner: "runQuery",
    argument: "spec.collection",
    scopeHash: "dd3665c1163907cc6c3a0df3ca50c724b6525eeb743505c432b936d68e28f795",
    count: 2,
    reason:
      "Authenticated operator remediation specs select the collection for a reviewed repair operation.",
  },
  {
    file: "src/lib/retention/archive.ts",
    owner: "archiveDocs",
    argument: "collection",
    scopeHash: "92a893eebee640d355d36f5e7ab78075c068d455dcd6a92a9beda790b83a1e56",
    count: 1,
    reason:
      "The named persistence operation receives its collection from a repository-owned caller.",
  },
  {
    file: "src/lib/retention/retention.ts",
    owner: "guardIds",
    argument: "policy.collection",
    scopeHash: "4a8a545dc0420182eb81e5680d4da2423d7f5d7e67925e7432d0f0712e6c909b",
    count: 1,
    reason:
      "The named persistence operation receives its collection from a repository-owned caller.",
  },
  {
    file: "src/lib/retention/retention.ts",
    owner: "runRetention",
    argument: "policy.collection",
    scopeHash: "27838f533a59b4f516142164f646b33a4d848443c380663c15f316bf4fdbffd3",
    count: 1,
    reason:
      "The named persistence operation receives its collection from a repository-owned caller.",
  },
  {
    file: "src/lib/sim/materializeSyntheticActors.ts",
    owner: "refuseNonSyntheticCollisions",
    argument: "collection",
    scopeHash: "1d59780d429606f902b004ef37abae52b71899a4a129b6123cfef1e0425c7d4f",
    count: 1,
    reason:
      "The named persistence operation receives its collection from a repository-owned caller.",
  },
  {
    file: "src/lib/turn/history/freezeOfficeHistoryIterations.ts",
    owner: "stamp",
    argument: "name",
    scopeHash: "9dc9977078ad511e405f4e6b898989f4791f1f7b89ff3b0b65f248616b379ecf",
    count: 2,
    reason:
      "The named persistence operation receives its collection from a repository-owned caller.",
  },
  {
    file: "src/lib/world/succession/materializeFederalRetirement.ts",
    owner: "materializeFederationFederalRetirement",
    argument: "collectionName",
    scopeHash: "c6a21c4e100f4f5e060f41e8adda395d10e996a04e835d6183530ab8db66aec2",
    count: 2,
    reason: "The world-transition operation iterates its explicit collection descriptors.",
  },
  {
    file: "src/lib/world/succession/materializeRussianCongress.ts",
    owner: "materializeProvisionalRussianCongress",
    argument: "collection",
    scopeHash: "c56c486c1962ebfbeaa889897e289c414412a39085c1df9dbe99522c0356e440",
    count: 1,
    reason: "The world-transition operation iterates its explicit collection descriptors.",
  },
  {
    file: "src/lib/world/succession/materializeRussianCongress.ts",
    owner: "preserveEstablishedRussianConstitution",
    argument: "collection",
    scopeHash: "c818e0013a74b978c7f8f4685884ec0d81e9611d8c969f7a8c07c94b6323086c",
    count: 2,
    reason: "The world-transition operation iterates its explicit collection descriptors.",
  },
  {
    file: "src/lib/singleplayer/saveArchive.ts",
    owner: "<anonymous-function>",
    argument: "done.name",
    scopeHash: "adc11d03e63213ed779b8655209bba33c459cf3f891ff04f42f638412f208e08",
    count: 1,
    reason:
      "Singleplayer saves copy every collection of the local world database by name, from the live database or from a save file of that world on the player's own machine. Loopback-only routes; no hosted path.",
  },
  {
    file: "src/lib/singleplayer/saveArchive.ts",
    owner: "describeCollections",
    argument: "entry.name",
    scopeHash: "3f05cf471f4d7bde6cdc4250ccb918c48de17918898ac732c9c3d7189d6cbe4e",
    count: 1,
    reason:
      "Singleplayer saves copy every collection of the local world database by name, from the live database or from a save file of that world on the player's own machine. Loopback-only routes; no hosted path.",
  },
  {
    file: "src/lib/singleplayer/saveArchive.ts",
    owner: "flush",
    argument: "current.name",
    scopeHash: "0a010e43ad066b19fffe764da263abfcf71fa556fe4e27fe1dd9d1b9225dbed3",
    count: 1,
    reason:
      "Singleplayer saves copy every collection of the local world database by name, from the live database or from a save file of that world on the player's own machine. Loopback-only routes; no hosted path.",
  },
  {
    file: "src/lib/singleplayer/saveArchive.ts",
    owner: "readLiveCollections",
    argument: "entry.name",
    scopeHash: "4388fa5b97584cae5b48387293df1b13f520355c71de48538e4089b3cb45874c",
    count: 1,
    reason:
      "Singleplayer saves copy every collection of the local world database by name, from the live database or from a save file of that world on the player's own machine. Loopback-only routes; no hosted path.",
  },
  {
    file: "src/lib/singleplayer/saveArchive.ts",
    owner: "restoreSaveArchive",
    argument: "descriptor.name",
    scopeHash: "f373553af419b5d65fad397d24fd38caf0ffe3f4728029d3c68fc348fc70bd94",
    count: 1,
    reason:
      "Singleplayer saves copy every collection of the local world database by name, from the live database or from a save file of that world on the player's own machine. Loopback-only routes; no hosted path.",
  },
  {
    file: "src/lib/singleplayer/saveArchive.ts",
    owner: "writeSaveArchive",
    argument: "collection.name",
    scopeHash: "11a465166e3a8407efa3bc8f15fb09f5883ad6c9d59f0052e1948635e6498609",
    count: 1,
    reason:
      "Singleplayer saves copy every collection of the local world database by name, from the live database or from a save file of that world on the player's own machine. Loopback-only routes; no hosted path.",
  },
];

/** Reviewed transport forwarding, separate from frozen legacy collection debt.
 * sessionDb passes the caller's exact collection name through and only binds
 * a Mongo session. It owns no collection or lifecycle. Literal collection
 * callsites remain discoverable in their domain modules; the exact body hash
 * forces re-review if this transparent transport behavior changes.
 */
export const SESSION_COLLECTION_FORWARDERS: readonly LegacyDynamicCollectionSite[] = [
  {
    file: "src/lib/db/sessionDb.ts",
    owner: "<anonymous-function>",
    argument: "name",
    scopeHash: "7204a1d56c5a83d2d9b9564fabd702551db3460044ab7f5b0dfb9523c715cd85",
    count: 1,
    reason:
      "Transparent session binding; names are supplied by already-scanned domain collection callsites, never generated here. No new collection, index or reset policy is introduced.",
  },
];
