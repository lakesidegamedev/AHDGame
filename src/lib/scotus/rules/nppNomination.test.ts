import { describe, expect, it } from "vitest";
import {
  SCOTUS_NPP_RENOMINATION_COOLDOWN_TURNS,
  chooseNppNominatingParty,
  isRenominationCoolingDown,
} from "./nppNomination";

describe("chooseNppNominatingParty", () => {
  it("leaves nomination to a player President", () => {
    expect(chooseNppNominatingParty({ kind: "player", party: "democrat" }, [])).toBeNull();
  });

  it("uses the NPP President's own party", () => {
    expect(chooseNppNominatingParty({ kind: "npp", party: "republican" }, [])).toBe("republican");
  });

  it("falls back to the largest Senate party when the presidency is vacant", () => {
    const senate = [
      { party: "democrat", seats: 1 },
      { party: "republican", seats: 1 },
      { party: "republican", seats: 1 },
      { party: undefined, seats: 9 },
    ];
    expect(chooseNppNominatingParty({ kind: "vacant" }, senate)).toBe("republican");
  });

  it("returns null with a vacant presidency and an empty Senate", () => {
    expect(chooseNppNominatingParty({ kind: "vacant" }, [])).toBeNull();
  });
});

describe("isRenominationCoolingDown", () => {
  it("is open when the seat never had a nomination", () => {
    expect(isRenominationCoolingDown(undefined, 100)).toBe(false);
  });

  it("blocks until the cooldown after the last vote closes", () => {
    const ends = 100;
    expect(isRenominationCoolingDown(ends, ends + SCOTUS_NPP_RENOMINATION_COOLDOWN_TURNS - 1)).toBe(
      true
    );
    expect(isRenominationCoolingDown(ends, ends + SCOTUS_NPP_RENOMINATION_COOLDOWN_TURNS)).toBe(
      false
    );
  });
});
