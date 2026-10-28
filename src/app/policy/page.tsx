import { redirect } from "next/navigation";
import { countryScopedUrl, type RedirectSearchParams } from "@/lib/countryRedirect";

export default async function PolicyRedirect({
  searchParams,
}: {
  searchParams: Promise<RedirectSearchParams>;
}) {
  redirect(countryScopedUrl("policy", await searchParams));
}
