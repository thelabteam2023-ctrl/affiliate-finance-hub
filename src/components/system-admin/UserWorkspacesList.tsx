import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getRoleLabel } from "@/lib/roleLabels";
import { cn } from "@/lib/utils";

interface WorkspaceMembership {
  workspace_id: string;
  workspace_name: string;
  role: string;
  is_active: boolean;
  joined_at: string;
}

interface UserWorkspacesListProps {
  workspaces: WorkspaceMembership[];
  className?: string;
}

// Cores para papéis
const ROLE_COLORS: Record<string, string> = {
  owner: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  admin: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  finance: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  operator: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  user: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  viewer: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

function getRoleBadgeColor(role: string): string {
  return ROLE_COLORS[role] || ROLE_COLORS.user;
}

export function UserWorkspacesList({ workspaces, className }: UserWorkspacesListProps) {
  if (!workspaces || workspaces.length === 0) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Building2 className="h-4 w-4 opacity-40" />
        <span className="text-sm italic">Sem workspace</span>
      </div>
    );
  }

  // Se tiver apenas 1 workspace, layout mais compacto
  if (workspaces.length === 1) {
    const ws = workspaces[0];
    return (
      <div className={cn("flex flex-col gap-0.5", className)}>
        <div className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground/70" />
          <span className="text-sm font-medium">{ws.workspace_name}</span>
        </div>
        <div className="pl-5">
          <Badge 
            variant="outline" 
            className={cn(
              "text-[10px] px-1.5 py-0 font-normal h-4",
              getRoleBadgeColor(ws.role)
            )}
          >
            {getRoleLabel(ws.role)}
          </Badge>
        </div>
      </div>
    );
  }

  // Múltiplos workspaces: lista estruturada
  return (
    <div className={cn("space-y-2", className)}>
      {workspaces.map((ws, idx) => (
        <div 
          key={ws.workspace_id || idx} 
          className={cn(
            "group relative pl-3 py-1",
            "before:absolute before:left-0 before:top-1 before:bottom-1",
            "before:w-0.5 before:rounded-full before:bg-border",
            // Destacar o primeiro (provavelmente o principal)
            idx === 0 && "before:bg-primary/40"
          )}
        >
          {/* Workspace Name - linha principal */}
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3 w-3 text-muted-foreground/60" />
            <span className="text-sm font-medium leading-tight">
              {ws.workspace_name}
            </span>
          </div>
          
          {/* Role Badge - linha secundária */}
          <div className="mt-0.5 pl-4">
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px] px-1.5 py-0 font-normal h-4",
                getRoleBadgeColor(ws.role),
                !ws.is_active && "opacity-50"
              )}
            >
              {getRoleLabel(ws.role)}
              {!ws.is_active && " (inativo)"}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
