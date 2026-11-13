import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthStaff } from "@/lib/auth";
import { defaultToolFor, toolPath } from "@/lib/staff/panelRegistry";
import { resolveViewAs, VIEW_AS_COOKIE } from "@/lib/staff/viewAs";

export default async function ControlIndexPage() {
  const staff = await getAuthStaff();
  const role = staff
    ? resolveViewAs(staff.staffRole, (await cookies()).get(VIEW_AS_COOKIE)?.value)
    : null;
  const tool = defaultToolFor(role);
  redirect(tool ? toolPath(tool) : "/dashboard");
}
