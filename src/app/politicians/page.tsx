import { redirect } from "next/navigation";
import { countryScopedUrl, type RedirectSearchParams } from "@/lib/countryRedirect";

export default async function PoliticiansRedirect({
  searchParams,
}: {
  searchParams: Promise<RedirectSearchParams>;
}) {
  redirect(countryScopedUrl("politicians", await searchParams));
}
