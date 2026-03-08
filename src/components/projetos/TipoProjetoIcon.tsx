import {
  Zap,
  Clover,
  BarChart3,
  Target,
  Gift,
  CircleDollarSign,
  Handshake,
  TrendingUp,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Zap,
  Clover,
  BarChart3,
  Target,
  Gift,
  CircleDollarSign,
  Handshake,
  TrendingUp,
  FolderOpen,
};

interface TipoProjetoIconProps {
  lucideIcon: string;
  className?: string;
}

export function TipoProjetoIcon({ lucideIcon, className }: TipoProjetoIconProps) {
  const IconComponent = ICON_MAP[lucideIcon];
  if (!IconComponent) return null;
  return <IconComponent className={cn("h-4 w-4", className)} />;
}
