import { redirect } from "next/navigation";
import { countryScopedUrl, type RedirectSearchParams } from "@/lib/countryRedirect";

export default async function BudgetRedirect({
  searchParams,
}: {
  searchParams: Promise<RedirectSearchParams>;
}) {
  redirect(countryScopedUrl("budget", await searchParams));
}
