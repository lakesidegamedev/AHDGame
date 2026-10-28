import { redirect } from "next/navigation";

interface Props {
  searchParams: Promise<{ country?: string }>;
}

/**
 * Alias route: resolve the requested country and send the browser on with a
 * real redirect. This must stay a server component - a client-side redirect
 * renders an empty document first, so logged-out visitors, link unfurlers and
 * other non-JS clients saw a blank page at /politicians.
 */
export default async function PoliticiansRedirect({ searchParams }: Props) {
  const { country } = await searchParams;
  redirect(`/country/${(country ?? "us").toLowerCase()}/politicians`);
}
