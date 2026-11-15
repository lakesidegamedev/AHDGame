import { describe, expect, it } from "vitest";
import { CA_COMMONS_2027 } from "./caCommons2027";
import { CA_COMMONS_SEATS_PER_REGION } from "./caRegions2027";
import { CA_PARTY_SLUG_TO_NAME } from "./caParties";
import { SLUG_TO_NAME, buildOfficeType } from "@/lib/npp/seedHistorical";
import { seatGroupsFor } from "@/lib/constants/historicalSeats";
import { tierFor } from "@/lib/world/eraRoster";

function seatsBy(key: (seat: (typeof CA_COMMONS_2027)[number]) => string) {
  const out: Record<string, number> = {};
  for (const seat of CA_COMMONS_2027) out[key(seat)] = (out[key(seat)] ?? 0) + seat.seatsHeld!;
  return out;
}

describe("Canada's founding Commons", () => {
  it("fills every riding in every province and territory", () => {
    expect(seatsBy((seat) => seat.state)).toEqual(CA_COMMONS_SEATS_PER_REGION);
  });

  it("matches the April 2025 national result", () => {
    expect(seatsBy((seat) => seat.party)).toEqual({
      ca_federal_unity: 169,
      ca_national_prosperity: 144,
      ca_laurentian: 22,
      ca_labour_commons: 7,
      ca_green_horizon: 1,
    });
  });

  it("seats the Quebec party only in Quebec", () => {
    const laurentian = CA_COMMONS_2027.filter((seat) => seat.party === "ca_laurentian");
    expect(laurentian.map((seat) => seat.state)).toEqual(["CA_QC"]);
  });

  it("resolves every party slug and seats each bloc as a multi-seat office", () => {
    for (const seat of CA_COMMONS_2027) {
      expect(SLUG_TO_NAME[seat.party]).toBe(CA_PARTY_SLUG_TO_NAME[seat.party]);
      expect(buildOfficeType(seat)).toEqual({
        type: "caCommons",
        state: seat.state,
        seatsHeld: seat.seatsHeld,
      });
    }
  });

  it("joins the 2027 seat groups exactly when the roster includes Canada", () => {
    const seated = seatGroupsFor("2027-default").CA;
    if (tierFor("2027-default", "CA") === "absent") expect(seated).toBeUndefined();
    else expect(seated).toBe(CA_COMMONS_2027);
  });
});
