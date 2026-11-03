"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/contexts/ToastContext";
import type { ConfirmDialogOptions } from "@/hooks/useConfirmDialog";
import { buildWithdrawalConfirmMessage } from "@/lib/elections/withdrawalWarning";
import { huDistrictIds } from "@/lib/countries/hu/rules/constituencies2014";
import { apiErrorText } from "@/lib/errors/catalog";
import { canEnter, canWithdraw, type EntryRuleRace } from "./entryRules";

/** The parts of an election (full view) the entry flow reads. */
export interface RaceEntryElection extends EntryRuleRace {
  id: string;
  countryId: string;
  electionType: string;
  state: string;
  allCandidates: Array<{ isYou: boolean }> | null;
  hungarianModernAssembly?: { ruleVersion: string };
  japanShugiinRules?: { ruleVersion: string };
  hungarianAssemblyRound?: { round: number };
  bulgarianFoundingRound?: { round: number; newNominationDistrictIds?: string[] };
}

/** True when the race's entry takes a constituency from an inline picker. */
export function needsConstituencyPicker(e: RaceEntryElection): boolean {
  return (
    e.hungarianAssemblyRound?.round === 1 ||
    e.bulgarianFoundingRound?.round === 1 ||
    Boolean(e.bulgarianFoundingRound?.newNominationDistrictIds?.length)
  );
}

const NETWORK_ERROR = "Network error. Please try again.";

/**
 * Entering and withdrawing from a race: the eligibility rules, the
 * country-specific constituency prompts (Hungary 2011, Japan 1994), the
 * confirmation, the enter / withdraw routes and their toasts. `confirm` is the
 * caller's in-page dialog (`useConfirmDialog`), so each page places its own.
 * `constituencyId` carries an inline picker's choice (Hungary 1989, Bulgaria 1990).
 */
export function useRaceEntry(
  election: RaceEntryElection | null,
  opts: {
    onDone: () => void | Promise<void>;
    confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
    constituencyId?: string;
  }
): {
  canEnter: boolean;
  canWithdraw: boolean;
  busy: boolean;
  enter: () => Promise<void>;
  withdraw: () => Promise<void>;
} {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const { onDone, confirm, constituencyId: pickedConstituency } = opts;
  const amInRace = !!election?.allCandidates?.some((c) => c.isYou);

  const enter = useCallback(async () => {
    if (!election) return;
    let constituencyId: string | undefined;
    let japanShugiinListOrder: number | undefined;
    const japanMixed = election.japanShugiinRules?.ruleVersion === "mixed-1994-v1";
    if (
      election.countryId === "HU" &&
      election.electionType === "nationalAssembly" &&
      election.hungarianModernAssembly?.ruleVersion === "mixed-2011-v1"
    ) {
      const districts = huDistrictIds(election.state);
      const answer = window.prompt(`Choose your constituency number (1-${districts.length}).`);
      if (answer === null) return;
      const number = Number(answer.trim());
      if (!Number.isInteger(number) || number < 1 || number > districts.length) {
        showToast("Choose a valid constituency number in this region.", "error");
        return;
      }
      constituencyId = districts[number - 1];
    }
    if (japanMixed) {
      // Only the 1994 Shugiin flow reads the statutory constituency table
      // (~72 KB). Loading it here keeps it out of every other page.
      const { JP_SHUGIIN_1994_CONSTITUENCIES } =
        await import("@/lib/countries/jp/data/jpShugiinConstituencies1994");
      const districts = JP_SHUGIIN_1994_CONSTITUENCIES.filter(
        (district) => district.regionId === election.state
      );
      const districtAnswer = window.prompt(
        `Choose a constituency number (1-${districts.length}; blank for party-list only). See the 1994 statutory constituency map with the race.`
      );
      if (districtAnswer === null) return;
      if (districtAnswer.trim()) {
        const number = Number(districtAnswer.trim());
        if (!Number.isInteger(number) || number < 1 || number > districts.length) {
          showToast("Choose a valid Shugiin constituency number.", "error");
          return;
        }
        constituencyId = districts[number - 1].id;
      }
      const listAnswer = window.prompt("Party-list position (1-300; blank for constituency only).");
      if (listAnswer === null) return;
      if (listAnswer.trim()) {
        const rank = Number(listAnswer.trim());
        if (!Number.isInteger(rank) || rank < 1 || rank > 300) {
          showToast("Choose a valid party-list position.", "error");
          return;
        }
        japanShugiinListOrder = rank;
      }
      if (!constituencyId && japanShugiinListOrder == null) {
        showToast("Choose a constituency, a party-list position, or both.", "error");
        return;
      }
    }
    if (
      !(await confirm({
        title: "Enter this race?",
        message: "This will register your character as a candidate.",
        confirmLabel: "Enter race",
      }))
    )
      return;
    setBusy(true);
    try {
      const body = japanMixed
        ? {
            ...(constituencyId ? { constituencyId } : {}),
            ...(japanShugiinListOrder != null ? { japanShugiinListOrder } : {}),
          }
        : constituencyId
          ? { constituencyId }
          : needsConstituencyPicker(election) && pickedConstituency
            ? { constituencyId: pickedConstituency }
            : null;
      const res = await fetch(
        `/api/elections/${election.id}/enter`,
        body
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : { method: "POST" }
      );
      const data = await res.json();
      if (res.ok) {
        showToast(data.message ?? "Entered race", "success");
        void import("@/lib/analytics/capture")
          .then(({ captureProductEvent }) => captureProductEvent("election_entered"))
          .catch(() => {});
        await onDone();
      } else {
        showToast(apiErrorText(data, "Failed to enter race"), "error");
      }
    } catch {
      showToast(NETWORK_ERROR, "error");
    } finally {
      setBusy(false);
    }
  }, [election, confirm, onDone, pickedConstituency, showToast]);

  const withdraw = useCallback(async () => {
    if (!election) return;
    // Phase decides the consequence wording: general-phase withdrawals
    // destroy accumulated votes; primary withdrawals do not.
    const phase: "primary" | "general" | "unknown" = election.inPrimary
      ? "primary"
      : election.isEnded
        ? "unknown"
        : "general";
    if (
      !(await confirm({
        title: "Confirm withdrawal",
        message: buildWithdrawalConfirmMessage(phase),
        confirmLabel: "Withdraw",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/elections/${election.id}/withdraw`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message ?? "Withdrawn from race", "success");
        await onDone();
      } else {
        showToast(apiErrorText(data, "Failed to withdraw"), "error");
      }
    } catch {
      showToast(NETWORK_ERROR, "error");
    } finally {
      setBusy(false);
    }
  }, [election, confirm, onDone, showToast]);

  return {
    canEnter: election ? canEnter(election, amInRace) : false,
    canWithdraw: election ? canWithdraw(election, amInRace) : false,
    busy,
    enter,
    withdraw,
  };
}
