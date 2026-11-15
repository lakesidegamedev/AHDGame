import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getAuthStaff } from "@/lib/auth";
import { ToolBody } from "@/components/control/ToolBody";
import { resolveViewAs, VIEW_AS_COOKIE } from "@/lib/staff/viewAs";
import { canSeeTool, findTool, REMOVED_TOOL_REDIRECTS } from "@/lib/staff/panelRegistry";

interface Props {
  params: Promise<{ area: string; tool: string }>;
}

export default async function ControlToolPage({ params }: Props) {
  const { area, tool: toolId } = await params;
  const staff = await getAuthStaff();
  if (!staff) redirect("/dashboard");

  const role = resolveViewAs(staff.staffRole, (await cookies()).get(VIEW_AS_COOKIE)?.value);

  const tool = findTool(toolId);
  const removedTarget = REMOVED_TOOL_REDIRECTS[toolId];
  if (!tool && removedTarget) redirect(removedTarget);
  if (!tool || tool.area !== area) notFound();
  // A tool the role may not see answers like a missing one.
  if (!canSeeTool(role, tool)) notFound();

  return (
    <section aria-labelledby="tool-title" className="space-y-4">
      <h1 id="tool-title" className="text-heading-sm font-semibold text-foreground">
        {tool.label}
      </h1>
      <ToolBody tool={tool} role={role} />
    </section>
  );
}
