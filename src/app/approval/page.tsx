import { redirect } from "next/navigation";
import { countryScopedUrl, type RedirectSearchParams } from "@/lib/countryRedirect";

export default async function ApprovalRedirect({
  searchParams,
}: {
  searchParams: Promise<RedirectSearchParams>;
}) {
  redirect(countryScopedUrl("approval", await searchParams));
}
