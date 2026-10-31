/**
 * Cabinet and central bank independence. Reads current role records, rather than
 * historical appointments or the character's primary office, for eligibility.
 * See getIncompatibleOfficeHolders.
 */
import type { Db, ObjectId } from "mongodb";
import type { CabinetMember } from "@/lib/db/types";
import type { CentralBank } from "@/lib/db/types/centralBank";
import { incompatibleBankHolders } from "./rules/officeCompatibility";

export async function getIncompatibleOfficeHolders(
  db: Db,
  destination: "cabinet" | "bank",
  characterIds: readonly ObjectId[]
): Promise<Set<string>> {
  if (characterIds.length === 0) return new Set();
  if (destination === "bank") {
    const members = await db
      .collection<CabinetMember>("cabinetMembers")
      .find({ characterId: { $in: [...characterIds] } }, { projection: { characterId: 1 } })
      .toArray();
    return new Set(
      members.flatMap((member) => (member.characterId ? [member.characterId.toString()] : []))
    );
  }
  const banks = await db
    .collection<CentralBank>("centralBanks")
    .find(
      {
        $or: [
          { chairCharacterId: { $in: [...characterIds] } },
          {
            countryId: "US",
            fomcBoard: {
              $elemMatch: { occupantType: "player", characterId: { $in: [...characterIds] } },
            },
          },
        ],
      },
      {
        projection: {
          countryId: 1,
          chairCharacterId: 1,
          "fomcBoard.occupantType": 1,
          "fomcBoard.characterId": 1,
        },
      }
    )
    .toArray();
  return incompatibleBankHolders(
    banks.map((bank) => ({
      countryId: bank.countryId,
      chairCharacterId: bank.chairCharacterId?.toString() ?? null,
      fomcBoard: bank.fomcBoard?.map((seat) => ({
        occupantType: seat.occupantType,
        characterId: seat.characterId?.toString() ?? null,
      })),
    }))
  );
}
