/** Concurrent chair requests may create only one in-flight bill per NPP. */
export const STATE_BILL_PARTY_NPP_INDEX = {
  key: { countryId: 1, sponsorNppId: 1 },
  options: {
    name: "stateBills_active_party_npp",
    unique: true,
    partialFilterExpression: {
      proposalPayerId: { $type: "objectId" },
      sponsorNppId: { $type: "objectId" },
      status: {
        $in: [
          "proposed",
          "active",
          "passed",
          "vetoed",
          "veto_override",
          "vote_closing",
          "override_closing",
        ],
      },
    },
  },
} as const;
