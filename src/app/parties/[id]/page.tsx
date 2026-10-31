import { redirect } from "next/navigation";
import { countryScopedUrl, type RedirectSearchParams } from "@/lib/countryRedirect";

export default async function PartyRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RedirectSearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  redirect(countryScopedUrl(`parties/${id}`, query));
}
