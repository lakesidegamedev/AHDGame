import type { ProposalVote } from "@/lib/db/types/internationalOrganization";
import { apiErrorText } from "@/lib/errors/catalog";

/** These actions return no data; successful responses need not contain JSON. */
export async function postOrganizationAction(url: string, body: unknown, failureMessage: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(apiErrorText(data, failureMessage));
  }
}

export function organizationVoteHandler(
  country: string | null,
  onChange: () => void,
  ballot: "legislation" | "leadership-elections" | "proposals"
) {
  return async (id: string, vote: ProposalVote) => {
    if (!country) throw new Error("No diplomatic role");
    await postOrganizationAction(
      `/api/country/${country}/international-organizations/${ballot}/${id}/vote`,
      { vote },
      "Vote failed"
    );
    onChange();
  };
}
