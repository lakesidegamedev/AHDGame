import { describe, expect, it } from "vitest";
import { CA_COMMONS_SEATS_PER_REGION } from "../data/caRegions2027";
import { CA_PARTY_SLUG_TO_NAME, CA_REGION_POLLING_2025 } from "../data/caParties";
import {
  caPendingFormation,
  caSlugToPartyId,
  caStatePartyOrgRows,
  commonsMajority,
} from "./opening2027";

const seeded = Object.values(CA_PARTY_SLUG_TO_NAME).map((name, index) => ({
  name,
  sequentialId: index + 1,
}));

describe("Canada opening party organization", () => {
  const slugToId = caSlugToPartyId(CA_PARTY_SLUG_TO_NAME, seeded);
  const rows = caStatePartyOrgRows(CA_REGION_POLLING_2025, slugToId);

  it("resolves every polling slug through the seeded party names", () => {
    expect(Object.keys(slugToId).sort()).toEqual(Object.keys(CA_PARTY_SLUG_TO_NAME).sort());
  });

  it("writes one row per region and party, keyed region then party", () => {
    expect(rows).toHaveLength(13 * 5);
    expect(new Set(rows.map((row) => row._id)).size).toBe(rows.length);
    for (const row of rows) expect(row._id).toBe(`${row.stateId}_${row.partyId}`);
  });

  it("gives the Quebec party a real machine only in Quebec", () => {
    const laurentian = slugToId.ca_laurentian!;
    const quebec = rows.find((row) => row.stateId === "CA_QC" && row.partyId === laurentian)!;
    const alberta = rows.find((row) => row.stateId === "CA_AB" && row.partyId === laurentian)!;
    expect(quebec.organization).toBeGreaterThan(30);
    expect(alberta.organization).toBe(5);
    expect(alberta.registration).toBe(0);
  });

  it("puts the right-of-centre party ahead in Alberta and the governing party ahead in Ontario", () => {
    const org = (stateId: string, slug: string) =>
      rows.find((row) => row.stateId === stateId && row.partyId === slugToId[slug])!.organization;
    expect(org("CA_AB", "ca_national_prosperity")).toBeGreaterThan(
      org("CA_AB", "ca_federal_unity")
    );
    expect(org("CA_ON", "ca_federal_unity")).toBeGreaterThan(
      org("CA_ON", "ca_national_prosperity")
    );
  });

  it("skips slugs whose party is not seeded", () => {
    const partial = caSlugToPartyId(CA_PARTY_SLUG_TO_NAME, seeded.slice(0, 2));
    expect(caStatePartyOrgRows(CA_REGION_POLLING_2025, partial)).toHaveLength(13 * 2);
  });
});

describe("Canada pending formation", () => {
  it("opens a 343-seat Commons that needs 172 for a majority", () => {
    const formation = caPendingFormation(CA_COMMONS_SEATS_PER_REGION);
    expect(formation).toMatchObject({
      _id: "CA",
      countryId: "CA",
      status: "pending",
      cycle: 1,
      totalSeats: 343,
      majorityThreshold: 172,
      governingPartyId: null,
    });
  });

  it("computes a simple majority", () => {
    expect(commonsMajority(343)).toBe(172);
    expect(commonsMajority(338)).toBe(170);
  });
});
