import { redirect } from "next/navigation";
import { getAuthStaff } from "@/lib/auth";
import { defaultToolFor, toolPath } from "@/lib/staff/panelRegistry";

export default async function ControlIndexPage() {
  const staff = await getAuthStaff();
  const tool = defaultToolFor(staff?.staffRole ?? null);
  redirect(tool ? toolPath(tool) : "/dashboard");
}
