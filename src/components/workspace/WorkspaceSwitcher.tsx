import { useState } from "react";
import { Check, ChevronsUpDown, Building2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { getRoleLabel } from "@/lib/roleLabels";
import { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface WorkspaceItem {
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string;
  role: AppRole;
  plan: string;
  is_default: boolean;
}

interface WorkspaceSwitcherProps {
  workspaces: WorkspaceItem[];
  currentWorkspaceId: string | null;
  onSwitch: (workspaceId: string) => void;
  isCollapsed?: boolean;
  loading?: boolean;
}

export function WorkspaceSwitcher({
  workspaces,
  currentWorkspaceId,
  onSwitch,
  isCollapsed = false,
  loading = false,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);

  const currentWorkspace = workspaces.find(
    (w) => w.workspace_id === currentWorkspaceId
  );

  if (workspaces.length <= 1 && !isCollapsed) {
    // Se só tem 1 workspace, mostra apenas o nome sem dropdown
    return (
      <div className="flex items-center gap-2 px-2 py-1.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 shrink-0">
          <Building2 className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="text-sm font-medium truncate">
            {currentWorkspace?.workspace_name || "Workspace"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {currentWorkspace ? getRoleLabel(currentWorkspace.role) : ""}
          </p>
        </div>
      </div>
    );
  }

  if (workspaces.length <= 1 && isCollapsed) {
    return (
      <div className="flex items-center justify-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
          <Building2 className="h-4 w-4 text-primary" />
        </div>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "justify-between hover:bg-accent/50 transition-colors",
            isCollapsed ? "h-8 w-8 p-0" : "w-full h-auto px-2 py-1.5"
          )}
          disabled={loading}
        >
          {isCollapsed ? (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-1 overflow-hidden">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 shrink-0">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 text-left overflow-hidden">
                  <p className="text-sm font-medium truncate">
                    {currentWorkspace?.workspace_name || "Selecionar..."}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {currentWorkspace ? getRoleLabel(currentWorkspace.role) : ""}
                  </p>
                </div>
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar workspace..." />
          <CommandList>
            <CommandEmpty>Nenhum workspace encontrado.</CommandEmpty>
            <CommandGroup heading="Seus Workspaces">
              {workspaces.map((workspace) => (
                <CommandItem
                  key={workspace.workspace_id}
                  value={workspace.workspace_name}
                  onSelect={() => {
                    onSwitch(workspace.workspace_id);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 shrink-0">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-sm font-medium truncate">
                        {workspace.workspace_name}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {getRoleLabel(workspace.role)}
                        </Badge>
                        {workspace.is_default && (
                          <span className="text-[10px] text-muted-foreground">
                            • Padrão
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Check
                    className={cn(
                      "ml-2 h-4 w-4",
                      currentWorkspaceId === workspace.workspace_id
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
