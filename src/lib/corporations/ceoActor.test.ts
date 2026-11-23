import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { isCeoActor, viewerRunsCorporation } from "./ceoActor";
import { shouldRedactCorporation } from "./redaction";

const account = new ObjectId();
const ceoCharacter = new ObjectId();
const sibling = new ObjectId();

const corp = (extra: Record<string, unknown> = {}) =>
  ({ userId: account, ceoId: ceoCharacter, ...extra }) as never;
const as = (character: ObjectId | null, userId = account) => ({
  userId: userId.toString(),
  activeCharacterId: character?.toString() ?? null,
});

describe("isCeoActor", () => {
  it("accepts the CEO character on the owning account", () => {
    expect(isCeoActor(corp(), as(ceoCharacter))).toBe(true);
  });

  it("refuses a sibling character on the same account", () => {
    expect(isCeoActor(corp(), as(sibling))).toBe(false);
  });

  it("refuses another account even with the CEO character id", () => {
    expect(isCeoActor(corp(), as(ceoCharacter, new ObjectId()))).toBe(false);
  });

  it("refuses a vacant seat", () => {
    expect(isCeoActor(corp({ ceoVacant: true }), as(ceoCharacter))).toBe(false);
  });

  it("falls back to the account for a legacy corporation with no CEO character", () => {
    expect(isCeoActor(corp({ ceoId: undefined }), as(sibling))).toBe(true);
  });

  it("falls back to the account when the active character is unknown", () => {
    expect(isCeoActor(corp(), as(null))).toBe(true);
  });

  it("matches the caretaker's underlying character, not the account", () => {
    const caretaker = corp({
      ceoType: "npp",
      ceoId: new ObjectId(),
      caretakerCeo: { underlyingCharacterId: ceoCharacter, underlyingUserId: account },
    });
    expect(isCeoActor(caretaker, as(ceoCharacter))).toBe(true);
    expect(isCeoActor(caretaker, as(sibling))).toBe(false);
  });

  it("keeps a vacancy caretaker with no underlying character at the account level", () => {
    const caretaker = corp({
      ceoType: "npp",
      ceoId: new ObjectId(),
      caretakerCeo: { underlyingUserId: account } as never,
    });
    expect(isCeoActor(caretaker, as(sibling))).toBe(true);
  });

  it("keeps imperial CEOs at the account level", () => {
    expect(isCeoActor(corp({ ceoType: "imperial" }), as(sibling))).toBe(true);
  });

  it("reads the character from a loaded auth user", () => {
    expect(isCeoActor(corp(), { userId: account.toString(), character: { _id: sibling } })).toBe(
      false
    );
    expect(
      isCeoActor(corp(), { userId: account.toString(), character: { _id: ceoCharacter } })
    ).toBe(true);
  });
});

describe("viewerRunsCorporation", () => {
  it("is false for a signed-out viewer", () => {
    expect(viewerRunsCorporation(corp(), null, null)).toBe(false);
  });
});

describe("private corporation redaction by character", () => {
  const priv = corp({ isPrivate: true });
  it("shows the books to the CEO character", () => {
    expect(
      shouldRedactCorporation(priv, account.toString(), false, false, ceoCharacter.toString())
    ).toBe(false);
  });
  it("redacts them for a sibling character on the same account", () => {
    expect(
      shouldRedactCorporation(priv, account.toString(), false, false, sibling.toString())
    ).toBe(true);
  });
  it("still shows them to admins", () => {
    expect(shouldRedactCorporation(priv, account.toString(), true, false, sibling.toString())).toBe(
      false
    );
  });
});
