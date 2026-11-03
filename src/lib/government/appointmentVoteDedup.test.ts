import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { activeAppointmentVoteFilter } from "./appointmentVoteDedup";

describe("activeAppointmentVoteFilter", () => {
  const nominator = new ObjectId();

  it("blocks a second coalition vote and any open vote by the same nominator", () => {
    const filter = activeAppointmentVoteFilter(
      "UK",
      {
        eligible: true,
        formationType: "minority",
        coalitionId: 9,
        coalitionPartyIds: ["2", "3"],
        qualifyingPartyIds: [2, 3],
      },
      nominator,
      "primeMinister"
    );

    expect(filter).toEqual({
      countryId: "UK",
      status: "active",
      office: { $exists: false },
      $or: [{ coalitionId: 9 }, { nominatedByCharacterId: nominator }],
    });
  });

  it("keys a party-only bid on the nominee party and scopes head-of-state votes", () => {
    const filter = activeAppointmentVoteFilter(
      "RU",
      {
        eligible: true,
        formationType: "majority",
        coalitionId: null,
        coalitionPartyIds: null,
        qualifyingPartyIds: [4],
      },
      nominator,
      "headOfState"
    );

    expect(filter).toEqual({
      countryId: "RU",
      status: "active",
      office: "headOfState",
      $or: [{ coalitionId: null, nomineePartyId: "4" }, { nominatedByCharacterId: nominator }],
    });
  });
});
