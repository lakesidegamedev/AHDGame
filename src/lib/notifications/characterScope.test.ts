import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import {
  characterScopeClause,
  mailCharacterMatch,
  resolveActiveCharacterScope,
} from "./characterScope";

const first = { _id: new ObjectId(), createdAt: new Date("2028-01-01") };
const second = { _id: new ObjectId(), createdAt: new Date("2028-03-01") };
const userId = new ObjectId();

describe("resolveActiveCharacterScope", () => {
  it("does not scope a single-character account", () => {
    expect(resolveActiveCharacterScope([first], first._id)).toBeNull();
  });
  it("bounds an added character to alerts created after it existed", () => {
    expect(resolveActiveCharacterScope([first, second], second._id)).toEqual({
      characterId: second._id.toString(),
      since: second.createdAt,
    });
  });
  it("leaves the oldest character unbounded and falls back to it", () => {
    expect(resolveActiveCharacterScope([second, first], null)).toEqual({
      characterId: first._id.toString(),
      since: null,
    });
  });
});

describe("characterScopeClause", () => {
  it("is absent without a scope", () => {
    expect(characterScopeClause(userId, null)).toBeNull();
    expect(mailCharacterMatch(null)).toEqual({});
  });
  it("keeps tagged alerts for the character and recent untagged ones", () => {
    const scope = resolveActiveCharacterScope([first, second], second._id);
    expect(characterScopeClause(userId, scope)).toEqual({
      $or: [
        { userId: { $ne: userId } },
        { "metadata.recipientCharacterId": second._id.toString() },
        {
          "metadata.recipientCharacterId": { $in: [null, ""] },
          "metadata.corporationId": { $in: [null, ""] },
          createdAt: { $gte: second.createdAt },
        },
      ],
    });
  });
  it("lets untagged corporation alerts through only for corporations the character runs", () => {
    const base = resolveActiveCharacterScope([first, second], second._id)!;
    const clause = characterScopeClause(userId, { ...base, corporationIds: ["corp-a"] }) as {
      $or: Array<Record<string, unknown>>;
    };
    expect(clause.$or[2]!["metadata.corporationId"]).toEqual({ $in: [null, "", "corp-a"] });
  });
  it("targets mail at the active character", () => {
    const scope = resolveActiveCharacterScope([first, second], second._id);
    expect(mailCharacterMatch(scope)).toEqual({ toCharacterId: second._id });
  });
});
