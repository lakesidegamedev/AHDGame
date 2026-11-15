// GET /api/pip/elections — Returns the player's active race, active elections feed, and legislature composition.
// Auth: public; auth enriches playerRace and scopes legislature to character's country
// Errors: none
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getAuthUser } from "@/lib/auth";
import { getEnabledCountryIds } from "@/lib/countryAccess";
import { handleRouteError } from "@/lib/api/errors";
import { getGameTime } from "@/lib/time/gameTime";
import { isPrimaryEnded } from "@/lib/elections/phases";
import { COUNTRY_CONFIGS, getCountryConfig, type CountryId } from "@/lib/constants/countries";
import type {
  Character,
  Election,
  ElectionCandidate,
  ElectedOfficial,
  ElectionVoteTally,
} from "@/lib/db/types";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { electionsCollection } from "@/lib/db/repositories/elections";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";
import { electionVoteTalliesCollection } from "@/lib/db/repositories/electionVoteTallies";

export async function GET() {
  try {
    const db = await getDb();
    const authUser = await getAuthUser();

    // Resolve character for auth-enriched fields
    let character: Character | null = null;
    if (authUser) {
      character = await charactersCollection(db).findOne({ userId: new ObjectId(authUser.userId) });
    }

    const isAdmin = authUser?.isAdmin === true;
    const enabledCountries = isAdmin ? undefined : await getEnabledCountryIds();

    // Determine which country's legislature to show — default US
    const countryId: CountryId = character?.countryId ?? COUNTRY_CONFIGS.US.id;
    const countryConfig = getCountryConfig(countryId);
    // Derive office types from config — avoids hardcoding per-country strings
    const primaryOfficeType = countryConfig.legislature.lowerChamber.key;
    const secondaryOfficeType = countryConfig.legislature.upperChamber?.key ?? null;

    // Active elections feed — filtered by enabled countries, sorted soonest first
    const activeFeedRaw = await electionsCollection(db)
      .find({
        status: { $in: ["active", "upcoming"] },
        ...(enabledCountries !== undefined && { countryId: { $in: enabledCountries } }),
      })
      .sort({ endTime: 1 })
      .limit(8)
      .toArray();

    // Turn-first phase labels so they match the turn-based resolution even when
    // real time has drifted ahead of the last successful turn.
    const pipGameTime = await getGameTime();

    const activeFeed = activeFeedRaw.map((e) => {
      const inPrimary =
        e.status === "active" && !isPrimaryEnded(e, pipGameTime.currentTurn, pipGameTime);
      return {
        id: e._id.toString(),
        electionType: e.electionType,
        state: e.state,
        countryId: e.countryId ?? COUNTRY_CONFIGS.US.id,
        phase: inPrimary ? ("primary" as const) : ("general" as const),
        endsAt: e.endTime ? new Date(e.endTime).toISOString() : null,
      };
    });

    // Legislature composition for the character's country — derived from config, not hardcoded
    const [primaryOfficials, secondaryOfficials] = await Promise.all([
      electedOfficialsCollection(db)
        .find({ officeType: primaryOfficeType })
        .project({ party: 1, seatsHeld: 1, state: 1 })
        .toArray() as Promise<ElectedOfficial[]>,
      secondaryOfficeType
        ? (electedOfficialsCollection(db)
            .find({ officeType: secondaryOfficeType })
            .project({ party: 1, seatsHeld: 1, state: 1 })
            .toArray() as Promise<ElectedOfficial[]>)
        : Promise.resolve([] as ElectedOfficial[]),
    ]);

    // Filter to correct country by state prefix
    const filterByCountry = (officials: ElectedOfficial[]) => {
      if (countryId === COUNTRY_CONFIGS.UK.id)
        return officials.filter((o) => o.state?.startsWith("UK_"));
      if (countryId === COUNTRY_CONFIGS.DE.id)
        return officials.filter((o) => o.state?.startsWith("DE_"));
      // US: no standard prefix
      return officials.filter(
        (o) => o.state && !o.state.startsWith("UK_") && !o.state.startsWith("DE_")
      );
    };

    const primaryFiltered = filterByCountry(primaryOfficials);
    const secondaryFiltered = filterByCountry(secondaryOfficials);

    const toCounts = (officials: ElectedOfficial[]) =>
      officials.reduce(
        (acc, o) => {
          const key = o.party ?? "vacant";
          acc[key] = (acc[key] ?? 0) + (o.seatsHeld ?? 1);
          return acc;
        },
        {} as Record<string, number>
      );

    // Player race (auth only)
    let playerRace = null;
    if (character) {
      const candidacy = await electionCandidatesCollection(db).findOne({
        characterId: character._id,
        status: "active",
      });

      if (candidacy) {
        const election = await electionsCollection(db).findOne({
          _id: candidacy.electionId,
          status: { $in: ["active", "upcoming"] },
        });

        if (election) {
          const inPrimary =
            election.status === "active" &&
            !isPrimaryEnded(election, pipGameTime.currentTurn, pipGameTime);

          // Rank candidate by vote count from the tally
          const [allCandidates, voteTally] = await Promise.all([
            electionCandidatesCollection(db)
              .find({ electionId: election._id, status: "active" })
              .toArray(),
            electionVoteTalliesCollection(db).findOne({ electionId: election._id }),
          ]);

          let position: number | null = null;
          if (voteTally && Object.keys(voteTally.totalVotes).length > 0) {
            const sorted = Object.entries(voteTally.totalVotes)
              .sort(([, a], [, b]) => b - a)
              .map(([id]) => id);
            const rank = sorted.indexOf(candidacy._id.toString()) + 1;
            position = rank > 0 ? rank : null;
          }

          playerRace = {
            electionId: election._id.toString(),
            electionType: election.electionType,
            state: election.state,
            countryId: election.countryId ?? COUNTRY_CONFIGS.US.id,
            phase: inPrimary ? ("primary" as const) : ("general" as const),
            position,
            totalCandidates: allCandidates.length,
            endsAt: election.endTime ? new Date(election.endTime).toISOString() : null,
            primaryEndsAt: election.primaryEndTime
              ? new Date(election.primaryEndTime).toISOString()
              : null,
          };
        }
      }
    }

    return NextResponse.json(
      {
        playerRace,
        activeFeed,
        legislature: {
          primary: toCounts(primaryFiltered),
          secondary: toCounts(secondaryFiltered),
          primaryLabel: countryConfig.legislature.lowerChamber.name,
          secondaryLabel: secondaryOfficeType
            ? (countryConfig.legislature.upperChamber?.name ?? "")
            : "",
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120, no-transform",
        },
      }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
