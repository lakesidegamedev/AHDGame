import { notFound, redirect } from "next/navigation";
import { getAuthStaff } from "@/lib/auth";
import { ToolBody } from "@/components/control/ToolBody";
import { canSeeTool, findTool, REMOVED_TOOL_REDIRECTS } from "@/lib/staff/panelRegistry";

interface Props {
  params: Promise<{ area: string; tool: string }>;
}

export default async function ControlToolPage({ params }: Props) {
  const { area, tool: toolId } = await params;
  const staff = await getAuthStaff();
  if (!staff) redirect("/dashboard");

  const tool = findTool(toolId);
  const removedTarget = REMOVED_TOOL_REDIRECTS[toolId];
  if (!tool && removedTarget) redirect(removedTarget);
  if (!tool || tool.area !== area) notFound();
  // A tool the role may not see answers like a missing one.
  if (!canSeeTool(staff.staffRole, tool)) notFound();

  return (
    <section aria-labelledby="tool-title" className="space-y-4">
      <h1 id="tool-title" className="text-heading-sm font-semibold text-foreground">
        {tool.label}
      </h1>
      <ToolBody tool={tool} role={staff.staffRole} />
    </section>
  );
}
