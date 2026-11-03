import { redirect } from "next/navigation";
import { countryScopedUrl, type RedirectSearchParams } from "@/lib/countryRedirect";

export default async function PartiesRedirect({
  searchParams,
}: {
  searchParams: Promise<RedirectSearchParams>;
}) {
  redirect(countryScopedUrl("parties", await searchParams));
}
