import type { Db } from "mongodb";
import type { GameState } from "@/lib/db/types";

export interface CountryTurnHookContext {
  db: Db;
  game: GameState;
  turn: number;
  year: number;
  now: Date;
}

export interface CountryTurnHook {
  /** Country or federation the hook belongs to. */
  readonly scope: string;
  readonly name: string;
  readonly run: (ctx: CountryTurnHookContext) => Promise<unknown>;
}

/**
 * Per-country constitutional, electoral and transition steps that run inside
 * the government-formation phase, in this order. Each loads its module lazily
 * and is idempotent and gated inside the module on its own preset and anchor.
 * Adding a country step is a row here, not a registry edit.
 */
export const COUNTRY_TURN_HOOKS: readonly CountryTurnHook[] = [
  {
    scope: "BG",
    name: "constitutionalMandate1991",
    run: async (c) =>
      (
        await import("@/lib/countries/bg/constitutionalProposals1991")
      ).processBg1991ConstitutionalMandate(c.db, c.game, c.turn, c.now),
  },
  {
    scope: "BG",
    name: "assemblyDissolution1991",
    run: async (c) =>
      (await import("@/lib/countries/bg/assemblyDissolution1991")).processBg1991AssemblyDissolution(
        c.db,
        c.game,
        c.turn,
        c.now
      ),
  },
  {
    scope: "BG",
    name: "constitutionalNpcProposal1991",
    run: async (c) =>
      (
        await import("@/lib/countries/bg/constitutionalNpcProposals1991")
      ).processBg1991ConstitutionalNpcProposal(c.db, c.game, c.turn, c.now),
  },
  {
    scope: "BG",
    name: "assemblyTransition",
    run: async (c) =>
      (await import("@/lib/turn/bgAssemblyTransition")).processBgAssemblyTransition(
        c.db,
        c.game,
        c.turn,
        c.now
      ),
  },
  {
    scope: "BG",
    name: "listVacancies1991",
    run: async (c) =>
      (await import("@/lib/countries/bg/listVacancies1991")).advanceBg1991ListVacancies(
        c.db,
        c.game,
        c.turn,
        c.now
      ),
  },
  {
    scope: "BG",
    name: "grandConstituencyByElections",
    run: async (c) =>
      (
        await import("@/lib/countries/bg/constituencyByElections1991")
      ).openBgGrandConstituencyByElections(c.db, c.game, c.turn, c.now),
  },
  {
    scope: "RO",
    name: "electoralMandate1992",
    run: async (c) =>
      (await import("@/lib/countries/ro/electoralProposals1992")).processRo1992ElectoralMandate(
        c.db,
        c.game,
        c.turn,
        c.now
      ),
  },
  {
    scope: "RO",
    name: "electoralNpcProposal1992",
    run: async (c) =>
      (
        await import("@/lib/countries/ro/electoralNpcProposals1992")
      ).processRo1992ElectoralNpcProposal(c.db, c.game, c.turn, c.now),
  },
  {
    scope: "RO",
    name: "parliamentTransition",
    run: async (c) =>
      (await import("@/lib/turn/roParliamentTransition")).processRoParliamentTransition(
        c.db,
        c.game,
        c.turn,
        c.now
      ),
  },
  {
    scope: "federation",
    name: "npcMandates",
    run: async (c) =>
      (await import("@/lib/turn/federationNpcMandates")).processFederationNpcMandates(
        c.db,
        c.game.preset,
        c.year,
        c.now
      ),
  },
  {
    scope: "federation",
    name: "ratifications",
    run: async (c) =>
      (await import("@/lib/turn/federationRatifications")).processFederationRatifications(
        c.db,
        c.game.preset,
        c.turn
      ),
  },
  {
    scope: "federation",
    name: "ratifiedSettlements",
    run: async (c) =>
      (await import("@/lib/turn/federationSettlements")).processRatifiedFederationSettlements(
        c.db,
        c.game.preset,
        c.turn,
        c.year,
        c.now
      ),
  },
  {
    scope: "YU",
    name: "dissolution",
    run: async (c) =>
      (await import("@/lib/turn/yuDissolution")).processYuDissolution(c.db, c.game, c.turn, c.now),
  },
  {
    scope: "RU",
    name: "constitutionalNpcProposals",
    run: async (c) =>
      (
        await import("@/lib/countries/ru/constitutionalNpcProposals")
      ).processRussianConstitutionalNpcProposals(c.db, c.game, c.turn, c.now),
  },
  {
    scope: "RU",
    name: "constitutionalMandates",
    run: async (c) =>
      (
        await import("@/lib/countries/ru/constitutionalProposals")
      ).processRussianConstitutionalMandates(c.db, c.game, c.turn, c.now),
  },
  {
    scope: "RU",
    name: "duma1995Mandate",
    run: async (c) =>
      (await import("@/lib/countries/ru/dumaElectoralProposals1995")).processRussianDuma1995Mandate(
        c.db,
        c.game,
        c.turn,
        c.now
      ),
  },
  {
    scope: "HU",
    name: "electoralMandate1994",
    run: async (c) =>
      (await import("@/lib/countries/hu/electoralProposals1994")).processHu1994ElectoralMandate(
        c.db,
        c.game,
        c.turn,
        c.now
      ),
  },
  {
    scope: "HU",
    name: "electoralNpcProposal1994",
    run: async (c) =>
      (
        await import("@/lib/countries/hu/electoralNpcProposals1994")
      ).processHu1994ElectoralNpcProposal(c.db, c.game, c.turn, c.now),
  },
  {
    scope: "HU",
    name: "electoralMandate2011",
    run: async (c) =>
      (await import("@/lib/countries/hu/electoralProposals2011")).processHu2011ElectoralMandate(
        c.db,
        c.game,
        c.turn,
        c.now
      ),
  },
  {
    scope: "HU",
    name: "electoralNpcProposal2011",
    run: async (c) =>
      (
        await import("@/lib/countries/hu/electoralNpcProposals2011")
      ).processHu2011ElectoralNpcProposal(c.db, c.game, c.turn, c.now),
  },
  {
    scope: "RU",
    name: "presidentialElectionOpening",
    run: async (c) =>
      (
        await import("@/lib/countries/ru/presidentialElectionOpening")
      ).openRussianPresidentialElection({
        db: c.db,
        game: c.game,
        turn: c.turn,
        now: c.now,
      }),
  },
  {
    scope: "RU",
    name: "presidencyTransition",
    run: async (c) =>
      (await import("@/lib/countries/ru/ruPresidencyTransition")).processRuPresidencyTransition(
        c.db,
        c.game,
        c.turn,
        c.now
      ),
  },
  {
    scope: "RU",
    name: "legislatureTransition",
    run: async (c) =>
      (await import("@/lib/countries/ru/ruLegislatureTransition")).processRuLegislatureTransition(
        c.db,
        c.game,
        c.turn,
        c.now
      ),
  },
];

export async function runCountryTurnHooks(ctx: CountryTurnHookContext): Promise<void> {
  for (const hook of COUNTRY_TURN_HOOKS) {
    await hook.run(ctx);
  }
}
