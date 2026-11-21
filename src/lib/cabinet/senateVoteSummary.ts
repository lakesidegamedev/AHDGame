import { didPass } from "@/lib/billLifecycleHelpers";

export function cabinetSenateVoteSummary(votesFor: number, votesAgainst: number): string {
  if (didPass(votesFor, votesAgainst)) return "Current tally meets the confirmation rule.";
  if (votesFor === 0 && votesAgainst === 0) return "No Yeas or Nays yet.";
  const needed = votesAgainst - votesFor + 1;
  return `${needed} more ${needed === 1 ? "Yea" : "Yeas"} needed at the current Nay count.`;
}
