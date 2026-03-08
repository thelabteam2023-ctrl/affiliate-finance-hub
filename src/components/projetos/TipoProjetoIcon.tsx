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

const ICON_MAP: Record<string, { component: React.ComponentType<{ className?: string }>; color: string }> = {
  Zap: { component: Zap, color: "text-cyan-400" },
  Clover: { component: Clover, color: "text-emerald-400" },
  BarChart3: { component: BarChart3, color: "text-purple-400" },
  Target: { component: Target, color: "text-amber-400" },
  Gift: { component: Gift, color: "text-rose-400" },
  CircleDollarSign: { component: CircleDollarSign, color: "text-blue-400" },
  Handshake: { component: Handshake, color: "text-orange-400" },
  TrendingUp: { component: TrendingUp, color: "text-indigo-400" },
  FolderOpen: { component: FolderOpen, color: "text-gray-400" },
};

interface TipoProjetoIconProps {
  lucideIcon: string;
  className?: string;
  colored?: boolean;
}

export function TipoProjetoIcon({ lucideIcon, className, colored = true }: TipoProjetoIconProps) {
  const entry = ICON_MAP[lucideIcon];
  if (!entry) return null;
  const IconComponent = entry.component;
  return <IconComponent className={cn("h-4 w-4", colored && entry.color, className)} />;
}
