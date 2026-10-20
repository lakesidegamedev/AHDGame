/**
 * Metric owners publish live cohort and economic readings, with funded linked
 * estimates where household and service ledgers do not exist. Legacy political
 * scores never stand in for owned healthcare access.
 */
import { inheritedCalibrationRegion } from "./rules/conversionCalibration";
import type { Db } from "mongodb";
import type { FederalBudget } from "@/lib/db/types/budget";
import type { MacroMetricsDoc } from "@/lib/db/types/macroMetrics";
import type { MilitaryUnit } from "@/lib/db/types/militaryUnit";
import type { State } from "@/lib/db/types/state";
import type { GameState } from "@/lib/db/types/gameState";
import type { TradeFlowSnapshot } from "@/lib/db/types/tradeFlowSnapshot";
import { getGdpAnchorRate } from "@/lib/currency/gdpAnchorRate";
import { commodityTradeBalance } from "./rules/tradeOwner";
import { loadTurnoutReadings } from "./loadTurnoutReadings";
import { openingGrossPurchasingInputs1991, openingLifeCalibration1991 } from "./openingSeed1991";
import { fiscalOwnerReadings } from "./rules/fiscalOwner";
import { nationalForceReadiness } from "./rules/forceReadiness";
import { provisionalRealPurchasingPower } from "./rules/realPurchasingPower";
import { dueResetMetricIds } from "./rules/refresh";
import {
  driftProxyValue,
  policyDriftTarget,
  POLICY_DRIFT_RATE_PER_TURN,
} from "./rules/policyDrift";
import { linkedOutcomeTargets } from "./rules/linkedOutcomes";
import { resetMetricConditionScore } from "./conditionScore";
import { demographicRates } from "./rules/demographicMeasurement";
import { ownedHealthAccess } from "./rules/ownedHealthAccess";
import { loadResetPolicyPressure } from "./loadPolicyPressure";
import { primaryMetricById } from "./catalog";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import type { ResetMetricSnapshot } from "./rules/snapshot";
import type { MetricOwnerTurnReadingsByBoard } from "./refreshTurn";
import { loadMetricLawDelivery } from "./loadLawDelivery";
import { householdPublication, HOUSEHOLD_PUBLICATION_IDS } from "./rules/householdPublication";
import { housingPublication, HOUSING_PUBLICATION_IDS } from "./rules/housingPublication";

let openingCalibrationCache: {
  gross: ReturnType<typeof openingGrossPurchasingInputs1991>;
  life: ReturnType<typeof openingLifeCalibration1991>;
} | null = null;

function openingCalibration() {
  return (openingCalibrationCache ??= {
    gross: openingGrossPurchasingInputs1991(),
    life: openingLifeCalibration1991(),
  });
}

const DIRECT_ECONOMIC_OWNERS = [
  ["01", "unemploymentRate"],
  ["03", "povertyRate"],
  ["05", "gdpGrowth"],
  ["06", "productivityGrowth"],
] as const;

const FAIL_CLOSED_OWNER_IDS = new Set([
  "01",
  "03",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "16",
  "18",
  "20",
  "54",
  "55",
  "56",
  "57",
]);

export async function collectResetMetricOwnerReadings(
  db: Db,
  boards: readonly ResetMetricSnapshot[],
  turn: number,
  year?: number
): Promise<MetricOwnerTurnReadingsByBoard> {
  const { gross: openingGross, life: openingLife } = openingCalibration();
  const regionalIds = boards
    .filter((board) => board.scope === "regional")
    .map((board) => board.regionId!);
  const countryIds = [...new Set(boards.map((board) => board.countryId))];
  const readinessDue = boards.some(
    (board) =>
      board.scope === "national" && dueResetMetricIds(board, turn, false, false).includes("57")
  );
  const [macro, budgets, units] = await Promise.all([
    db
      .collection<MacroMetricsDoc>("macroMetrics")
      .find(
        { _id: { $in: regionalIds } },
        {
          projection: {
            _id: 1,
            countryId: 1,
            "economic.medianIncome.value": 1,
            "economic.costOfLiving.value": 1,
            "economic.unemploymentRate.value": 1,
            "economic.povertyRate.value": 1,
            "economic.gdpGrowth.value": 1,
            "economic.productivityGrowth.value": 1,
            "economic.tradeBalance.value": 1,
            resetCohortReading: 1,
            labourEmployment: 1,
          },
        }
      )
      .toArray(),
    db
      .collection<FederalBudget>("federalBudget")
      .find(
        { countryId: { $in: countryIds } },
        {
          projection: {
            countryId: 1,
            gdp: 1,
            "revenue.total": 1,
            "spending.total": 1,
            "economicFactors.inflationRate": 1,
            "debt.principal": 1,
          },
        }
      )
      .toArray(),
    readinessDue
      ? db
          .collection<MilitaryUnit>("militaryUnits")
          .find(
            { countryId: { $in: countryIds } },
            {
              projection: {
                countryId: 1,
                basePower: 1,
                readiness: 1,
                integrity: 1,
                supply: 1,
                readyAtTurn: 1,
              },
            }
          )
          .toArray()
      : Promise.resolve([]),
  ]);
  const [trade, states, world] = await Promise.all([
    db
      .collection<TradeFlowSnapshot>("tradeFlowSnapshots")
      .find({ turn }, { projection: { turn: 1, national: 1 } })
      .toArray(),
    db
      .collection<State>("states")
      .find(
        { _id: { $in: regionalIds }, countryId: { $in: countryIds } },
        {
          projection: {
            _id: 1,
            countryId: 1,
            population: 1,
            workingAgePopulation: 1,
            votingEligiblePopulation: 1,
          },
        }
      )
      .toArray(),
    db
      .collection<GameState>("gameState")
      .findOne({ _id: "current" }, { projection: { preset: 1 } }),
  ]);
  const turnout = await loadTurnoutReadings(db, {
    turn,
    sourceTurn: Math.min(...boards.map((b) => b.sourceTurn)),
    countries: countryIds,
    states,
  });
  const stateById = new Map(states.map((s) => [s._id, s]));
  const laws = boards.some((b) => b.scope === "national" && (b.householdSource || b.housingSource))
    ? await loadMetricLawDelivery(db, {
        worldId: boards[0]!.worldId,
        turn,
        countryIds,
        regions: boards
          .filter((b) => b.scope === "regional")
          .map((b) => ({ _id: b.regionId!, countryId: b.countryId })),
      })
    : undefined;
  const pressureByBoard = await loadResetPolicyPressure(db, {
    worldId: boards[0]!.worldId,
    boards,
    turn,
    laws,
  });
  const householdByRegion = new Map(
    countryIds.flatMap((countryId) => {
      const national = boards.find((b) => b.countryId === countryId && b.scope === "national");
      const regions = boards.filter((b) => b.countryId === countryId && b.scope === "regional");
      const result = householdPublication({
        worldId: boards[0]!.worldId,
        countryId,
        turn,
        regionIds: regions.map((b) => b.regionId!),
        source: national?.householdSource,
        programs: laws?.programs ?? [],
        settlements: laws?.settlements ?? new Map(),
      });
      // Adoption is country-wide. Missing later inputs freeze the adopted definition
      // with its old measurement date, never silently revert it to a gross-income proxy.
      const adopted = regions.some((b) =>
        HOUSEHOLD_PUBLICATION_IDS.some((id) => b.observations[id]?.definitionVersion === 2)
      );
      return regions.map(
        (b) =>
          [
            b._id,
            result.get(b.regionId!) ??
              (adopted
                ? Object.fromEntries(
                    HOUSEHOLD_PUBLICATION_IDS.map((id) => [id, b.observations[id]!])
                  )
                : {}),
          ] as const
      );
    })
  );
  const housingByRegion = new Map(
    countryIds.flatMap((countryId) => {
      const national = boards.find((b) => b.countryId === countryId && b.scope === "national");
      const regions = boards.filter((b) => b.countryId === countryId && b.scope === "regional");
      const source = national?.housingSource;
      const populationMatches = source?.regions.every((r) => {
        const state = stateById.get(r.regionId);
        return state?.countryId === countryId && state.population === r.flow.population;
      });
      const result = housingPublication({
        worldId: boards[0]!.worldId,
        countryId,
        turn,
        regionIds: regions.map((b) => b.regionId!),
        source: populationMatches ? source : undefined,
        householdSource: national?.householdSource,
        householdReadings: new Map(
          regions.map((b) => [b.regionId!, householdByRegion.get(b._id) ?? {}])
        ),
        priorStates: new Map(
          regions.flatMap((b) => (b.housingState ? [[b.regionId!, b.housingState] as const] : []))
        ),
        programs: laws?.programs ?? [],
        settlements: laws?.settlements ?? new Map(),
      });
      const adopted = regions.some((b) =>
        HOUSING_PUBLICATION_IDS.some((id) => b.observations[id]?.definitionVersion === 2)
      );
      return regions.map(
        (b) =>
          [
            b._id,
            result.get(b.regionId!) ?? {
              state: undefined,
              updates: adopted
                ? Object.fromEntries(HOUSING_PUBLICATION_IDS.map((id) => [id, b.observations[id]!]))
                : {},
            },
          ] as const
      );
    })
  );
  const scoreYear = year ?? 1991 + Math.floor((turn - 1) / TURNS_PER_YEAR);
  // All country members must publish the same definition/window, including a
  // partially completed bulk retry. Never certify a half-migrated country.
  for (const countryId of countryIds) {
    const regions = boards.filter((b) => b.countryId === countryId && b.scope === "regional");
    for (const [ids, readings] of [
      [
        HOUSEHOLD_PUBLICATION_IDS,
        new Map(regions.map((b) => [b._id, householdByRegion.get(b._id) ?? {}])),
      ],
      [
        HOUSING_PUBLICATION_IDS,
        new Map(regions.map((b) => [b._id, housingByRegion.get(b._id)?.updates ?? {}])),
      ],
    ] as const) {
      for (const id of ids) {
        const candidates = regions.map((b) => readings.get(b._id)?.[id]);
        if (
          candidates.some((o) => o?.definitionVersion === 2) &&
          candidates.some((o) => o?.definitionVersion !== 2)
        )
          throw new Error("Cannot publish a partial country definition migration");
        for (const board of regions.filter((b) => b.asOfTurn === turn)) {
          const prior = board.observations[id],
            candidate = readings.get(board._id)?.[id];
          if (prior?.definitionVersion !== 2 && candidate?.definitionVersion !== 2) continue;
          const receipt = (o: typeof prior | undefined) =>
            JSON.stringify(
              o && [o.value, o.unit, o.definitionVersion, o.observedAtTurn, o.countryBasis]
            );
          if (receipt(prior) !== receipt(candidate))
            throw new Error("Metric source changed during partial country replay");
        }
      }
    }
  }
  const macroById = new Map(macro.map((row) => [String(row._id), row]));
  const budgetByCountry = new Map(budgets.map((row) => [row.countryId, row]));
  const unitsByCountry = new Map(
    countryIds.map((countryId) => [countryId, units.filter((unit) => unit.countryId === countryId)])
  );
  return Object.fromEntries(
    boards.map((board) => {
      // The demographic phase runs each turn. A missing current-turn receipt
      // must leave the cohort observation due, not silently defer it forever.
      const cohortDue = board.scope === "regional";
      const event = board.regionId ? turnout.get(board.regionId) : undefined;
      const electionDue = Boolean(
        event && event.turn > (board.observations["51"]?.observedAtTurn ?? board.sourceTurn)
      );
      const dueIds = dueResetMetricIds(board, turn, cohortDue, electionDue);
      const due = new Set(dueIds);
      const updates: Record<string, ResetMetricSnapshot["observations"][string]> = {};
      if (board.asOfTurn === turn)
        return [
          board._id,
          {
            updates: Object.fromEntries(dueIds.map((id) => [id, board.observations[id]!])),
            cohortDue,
            electionDue,
          },
        ];
      if (board.scope === "national") {
        const budget = budgetByCountry.get(board.countryId);
        const fiscal = fiscalOwnerReadings({
          gdp: budget?.gdp,
          revenue: budget?.revenue?.total,
          spending: budget?.spending?.total,
          debtPrincipal: budget?.debt?.principal,
          inflationRate: budget?.economicFactors?.inflationRate,
        });
        if (due.has("07") && fiscal.priceChange !== null) {
          updates["07"] = {
            ...board.observations["07"]!,
            value: fiscal.priceChange,
            status: "derived",
            source: "current federal budget price process",
            note: "Annual CPI change from the live price process, not a 0-100 score.",
          };
        }
        if (due.has("09") && fiscal.balanceToGdp !== null) {
          updates["09"] = {
            ...board.observations["09"]!,
            value: fiscal.balanceToGdp,
            status: "derived",
            source: "current national revenue less spending and GDP",
            note: "Annual budget balance as a share of current GDP.",
          };
        }
        if (due.has("10") && fiscal.debtToGdp !== null) {
          updates["10"] = {
            ...board.observations["10"]!,
            value: fiscal.debtToGdp,
            status: "derived",
            source: "current sovereign principal and GDP",
            note: "Outstanding sovereign principal as a share of current GDP.",
          };
        }
        if (due.has("57")) {
          const readiness = nationalForceReadiness(unitsByCountry.get(board.countryId) ?? [], turn);
          if (readiness !== null) {
            updates["57"] = {
              ...board.observations["57"]!,
              value: readiness,
              status: "derived",
              source: "current national military roster",
              note: "Power-weighted readiness after condition, supply, and operational-date checks.",
            };
          }
        }
      } else {
        if (electionDue && event)
          updates["51"] = {
            ...board.observations["51"]!,
            value: (100 * event.ballots) / event.eligible,
            status: "proxy",
            source: "latest completed election tally",
            note: "Counted ballots divided by current eligible residents. Historical tallies without a frozen register remain an electorate-denominator proxy; simultaneous offices are not added together.",
            observedAtTurn: event.turn,
            ratioBasis: { numerator: event.ballots, denominator: event.eligible },
          };
        if (due.has("08")) {
          const flows = trade.find((s) => s.turn === turn)?.national[board.countryId];
          const gdp = budgetByCountry.get(board.countryId)?.gdp;
          const value =
            flows && typeof gdp === "number"
              ? commodityTradeBalance({
                  exports: flows.exports,
                  imports: flows.imports,
                  annualGdpAnchor: gdp * getGdpAnchorRate(board.countryId, world?.preset),
                  turnsPerYear: TURNS_PER_YEAR,
                })
              : null;
          updates["08"] = {
            ...board.observations["08"]!,
            value: value ?? board.observations["08"]!.value,
            status: "proxy",
            source:
              value === null
                ? "retained trade observation: current cleared-flow ledger unavailable"
                : "current national cleared-commodity trade ledger",
            note:
              value === null
                ? "No current trade-flow receipt; this is not a newly measured balance."
                : "Annualized commodity exports less imports as a share of annual GDP. National scope repeated on regional boards; services and unmodeled external trade are not included.",
            observedAtTurn:
              value === null
                ? (board.observations["08"]?.observedAtTurn ?? board.sourceTurn)
                : turn,
          };
        }
        const candidateMacro = macroById.get(board.regionId!);
        const liveMacro =
          candidateMacro?.countryId === board.countryId ? candidateMacro : undefined;
        for (const [id, field] of DIRECT_ECONOMIC_OWNERS) {
          if (!due.has(id)) continue;
          const value = liveMacro?.economic?.[field]?.value;
          if (typeof value !== "number" || !Number.isFinite(value)) continue;
          updates[id] = {
            ...board.observations[id]!,
            value,
            status: id === "03" ? "proxy" : "derived",
            source: `current regional economy engine: ${field}`,
            note:
              id === "03"
                ? "Modeled population-share estimate, not surveyed household poverty. Current funded law delivery replaces booked social spending in v2 countries; historical adjustments decay over time."
                : "Current model result, not a political-board score or an independently measured statistic.",
            ratioBasis:
              id === "01" &&
              liveMacro?.labourEmployment?.lastTurn === turn &&
              liveMacro.labourEmployment.laborForce > 0
                ? {
                    numerator: (value / 100) * liveMacro.labourEmployment.laborForce,
                    denominator: liveMacro.labourEmployment.laborForce,
                  }
                : undefined,
          };
        }
        if (due.has("02")) {
          const current = liveMacro;
          const opening =
            openingGross[
              inheritedCalibrationRegion(board.countryId, board.regionId!)
                .countryId as keyof typeof openingGross
            ]?.[inheritedCalibrationRegion(board.countryId, board.regionId!).regionId];
          const income = current?.economic?.medianIncome?.value;
          const basket = current?.economic?.costOfLiving?.value;
          if (opening && typeof income === "number" && typeof basket === "number") {
            try {
              updates["02"] = {
                ...board.observations["02"]!,
                value: provisionalRealPurchasingPower({
                  currentGrossIncome: income,
                  currentBasketIndex: basket,
                }),
                status: "proxy",
                source: "game-calibrated gross household income and consumer basket",
                note: "Annual real household income in local currency at constant 1991 prices. Taxes and transfers are not yet included.",
              };
            } catch {
              // The missing due reading is surfaced by the persistence shell.
            }
          }
        }
        const cohort = liveMacro?.resetCohortReading;
        if (cohort?.asOfTurn === turn) {
          const lifeCalibration =
            openingLife[
              inheritedCalibrationRegion(board.countryId, board.regionId!)
                .countryId as keyof typeof openingLife
            ]?.[inheritedCalibrationRegion(board.countryId, board.regionId!).regionId];
          const measures = [
            [
              "20",
              cohort.mortality
                ? (demographicRates([cohort.mortality]) ?? cohort.periodLifeExpectancy)
                : typeof cohort.periodLifeExpectancy === "number" && lifeCalibration
                  ? lifeCalibration.openingYears +
                    cohort.periodLifeExpectancy -
                    lifeCalibration.modeledYears
                  : null,
              "Period life expectancy from this turn's age-specific mortality curve, calibrated to the 1991 opening regional anchor.",
            ],
            [
              "54",
              cohort.populationGrowthAnnualized,
              "Annualized population change from this turn's realized births, deaths, and migration.",
            ],
            [
              "55",
              cohort.fertility
                ? (demographicRates([cohort.fertility]) ?? cohort.realizedTfr)
                : cohort.realizedTfr,
              "Realized fertility from births and the female age distribution, including service constraints.",
            ],
            [
              "56",
              cohort.dependencyBurden15To64,
              "Residents under 15 and 65 or older per 100 residents aged 15-64.",
            ],
          ] as const;
          for (const [id, value, note] of measures) {
            if (!due.has(id) || typeof value !== "number" || !Number.isFinite(value)) continue;
            updates[id] = {
              ...board.observations[id]!,
              value,
              status: "derived",
              source: "current single-year age and sex cohort flow",
              note,
              demographicBasis: undefined,
              ratioBasis: undefined,
              observedAtTurn: turn,
              ...(id === "20" && cohort.mortality
                ? {
                    demographicBasis: cohort.mortality,
                    note: "Period life table from the same age-specific mortality used by the cohort flow, including pandemic excess deaths. No additive display adjustment.",
                  }
                : {}),
              ...(id === "55" && cohort.fertility
                ? {
                    demographicBasis: cohort.fertility,
                    note: "Sum of annual births per woman at each maternal age. Service withdrawals reduce only the affected ages.",
                  }
                : {}),
              ...(id === "54" && cohort.populationBefore && cohort.populationAfter !== undefined
                ? {
                    ratioBasis: {
                      numerator:
                        (cohort.populationAfter - cohort.populationBefore) * TURNS_PER_YEAR,
                      denominator: cohort.populationBefore,
                    },
                  }
                : {}),
              ...(id === "56" && stateById.get(board.regionId!)?.population
                ? {
                    ratioBasis: {
                      numerator:
                        stateById.get(board.regionId!)!.population -
                        stateById.get(board.regionId!)!.population / (1 + value / 100),
                      denominator: stateById.get(board.regionId!)!.population / (1 + value / 100),
                    },
                  }
                : {}),
            };
          }
        }
      }
      // Several v2 outcomes do not yet have a more granular physical ledger in
      // the game. They carry their opening value forward instead of reading the
      // retired v1 political score, and the funded law and Cabinet pressure the
      // board already displays moves them toward its settlement on each refresh
      // (ticket 1539: the pressure used to be display-only, so energy security
      // sat at its opening value for 170 turns of enacted energy law). This is
      // deliberately labelled as a game-calibrated estimate so the UI never
      // presents it as a fresh measurement. Owners with live ledgers above
      // remain fail-closed.
      const pressure = pressureByBoard.get(board._id) ?? {};
      for (const id of dueIds) {
        if (updates[id] || FAIL_CLOSED_OWNER_IDS.has(id)) continue;
        const prior = board.observations[id];
        if (typeof prior?.value !== "number" || !Number.isFinite(prior.value)) continue;
        if (prior.definitionVersion === 2) {
          updates[id] = prior;
          continue;
        }
        // A partially completed bulk retry must not apply proxy drift twice.
        if (board.asOfTurn === turn) {
          updates[id] = prior;
          continue;
        }
        const metric = primaryMetricById(id);
        const openingValue = board.openingValues?.[id] ?? board.history?.[id]?.[0]?.value;
        const points = pressure[id] ?? 0;
        const value =
          metric && typeof openingValue === "number" && Number.isFinite(openingValue)
            ? driftProxyValue({
                metric,
                currentValue: prior.value,
                openingValue,
                pressure: points,
                countryId: board.countryId,
                year: scoreYear,
              })
            : prior.value;
        const moved = points !== 0 || value !== prior.value;
        updates[id] = {
          ...prior,
          value,
          status: "proxy",
          source: moved
            ? `provisional continuity owner: ${prior.owner}, moved by enacted-law and Cabinet pressure`
            : `provisional continuity owner: ${prior.owner}`,
          note: moved
            ? "Game-calibrated estimate until this owner has a physical live ledger: funded laws and active Cabinet initiatives move this line toward their settlement each refresh, and it returns toward its opening when they lapse."
            : "Game-calibrated carry-forward until this owner has a physical live ledger. Laws and actions affect underlying systems where implemented; this estimate does not invent a direct bonus.",
        };
      }
      if (board.scope === "regional") {
        const opening =
          board.openingValues ??
          Object.fromEntries(
            Object.entries(board.history ?? {}).map(([id, series]) => [id, series[0]!.value])
          );
        const accessTargets = ["16", "18"].map((id) =>
          policyDriftTarget({
            metric: primaryMetricById(id)!,
            currentValue: board.observations[id]!.value!,
            openingValue: opening[id]!,
            pressure: pressure[id] ?? 0,
            countryId: board.countryId,
            year: scoreYear,
          })
        );
        const access = accessTargets.every((v) => v !== null)
          ? ownedHealthAccess({
              coverageTarget: accessTargets[0]!,
              delayTarget: accessTargets[1]!,
              preparedness: updates["23"]?.value ?? board.observations["23"]!.value!,
              openingPreparedness: opening["23"]!,
            })
          : null;
        if (access)
          for (const [id, target] of [
            ["16", access.coverage],
            ["18", access.delay],
          ] as const) {
            if (due.has(id))
              updates[id] = {
                ...board.observations[id]!,
                value: Number(
                  (
                    board.observations[id]!.value! +
                    POLICY_DRIFT_RATE_PER_TURN * (target - board.observations[id]!.value!)
                  ).toFixed(6)
                ),
                status: "proxy",
                source: "owned health coverage, delay and delivered preparedness model",
                note: "Opening-calibrated funded service estimate. Uses owned preparedness, not retired political-score inversions; patient/provider ledgers are not yet modeled.",
              };
          }
        const current = Object.fromEntries(
          Object.entries({ ...board.observations, ...updates }).map(([id, o]) => [id, o.value])
        );
        // Legacy linked estimates have old-definition opening baselines. Until
        // those owners migrate, do not compare disposable income/relative poverty
        // or payment burden against gross-income/proxy/index opening values.
        for (const id of ["02", "03", "24", "41"])
          if (board.observations[id]?.definitionVersion === 2)
            current[id] = opening[id] ?? current[id];
        const policyTargets: Record<string, number> = {};
        for (const id of ["19", "24", "41", "42"]) {
          const metric = primaryMetricById(id)!;
          const value = policyDriftTarget({
            metric,
            currentValue: board.observations[id]!.value!,
            openingValue: opening[id]!,
            pressure: pressure[id] ?? 0,
            countryId: board.countryId,
            year: scoreYear,
          });
          if (value !== null) policyTargets[id] = value;
        }
        const conditionChanges = [
          "01",
          "03",
          "16",
          "19",
          "24",
          "26",
          "29",
          "30",
          "31",
          "47",
          "48",
          "50",
        ].flatMap((id) => {
          const metric = primaryMetricById(id)!;
          const now = current[id],
            base = opening[id];
          if (typeof now !== "number" || typeof base !== "number") return [];
          const a = resetMetricConditionScore(metric, now, board.countryId, scoreYear);
          const b = resetMetricConditionScore(metric, base, board.countryId, scoreYear);
          return a !== null && b !== null ? [a - b] : [];
        });
        const targets = linkedOutcomeTargets({ opening, current, policyTargets, conditionChanges });
        for (const [id, target] of Object.entries(targets)) {
          if (!due.has(id)) continue;
          const prior = board.observations[id]!;
          if (prior.definitionVersion === 2) continue;
          updates[id] = {
            ...prior,
            value: Number(
              (prior.value! + POLICY_DRIFT_RATE_PER_TURN * (target - prior.value!)).toFixed(6)
            ),
            status: "proxy",
            source:
              "linked outcome model using current owned conditions and funded program delivery",
            note:
              id === "49"
                ? "Trust follows livelihood, service and governance conditions; legislation cannot grant trust directly. Model estimate, not a survey."
                : "Opening-calibrated model with explicit livelihood or care-access elasticities and funded policy delivery. Not an observed household or clinical ledger.",
          };
        }
        const population = stateById.get(board.regionId!)?.population;
        const median = updates["02"]?.value,
          gini = updates["04"]?.value;
        for (const id of ["02", "04"])
          if (updates[id]) updates[id] = { ...updates[id]!, householdBasis: undefined };
        if (
          typeof median === "number" &&
          median > 0 &&
          typeof gini === "number" &&
          gini >= 0 &&
          gini <= 95 &&
          population &&
          population > 0
        ) {
          const householdBasis = { median, gini, weight: population };
          for (const id of ["02", "04"]) updates[id] = { ...updates[id]!, householdBasis };
        }
      }
      for (const [id, observation] of Object.entries(householdByRegion.get(board._id) ?? {}))
        if (due.has(id)) updates[id] = observation;
      for (const [id, observation] of Object.entries(housingByRegion.get(board._id)?.updates ?? {}))
        if (due.has(id)) updates[id] = observation;
      return [
        board._id,
        { updates, cohortDue, electionDue, housingState: housingByRegion.get(board._id)?.state },
      ];
    })
  );
}
