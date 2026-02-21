/**
 * Painel de Relacionamentos do Projeto - Versão Compacta
 * 
 * Exibe KPIs inline horizontais: Contas | Limitadas | Parceiros
 * Com popover sob demanda para histórico e indicadores operacionais.
 */

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Link2, 
  History, 
  AlertTriangle, 
  Users, 
  Gift,
  Building2,
  TrendingUp,
  Globe,
  Info,
  X
} from "lucide-react";
import { useProjetoHistoricoContas } from "@/hooks/useProjetoHistoricoContas";
import { createPortal } from "react-dom";

interface ContasNoProjetoCardProps {
  projetoId: string;
  hasForeignCurrency?: boolean;
}

/** Overlay centralizado para detalhes do Painel de Relacionamentos */
function RelacionamentosOverlay({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = orig;
      document.removeEventListener("keydown", handler);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ background: "rgba(0,0,0,0.45)" }}
    >
      <div
        className="relative bg-background border border-border rounded-xl shadow-2xl flex flex-col"
        style={{ width: "min(560px, 90vw)", maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 h-7 w-7 z-10"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
        <div className="overflow-y-auto p-5 pr-10">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ContasNoProjetoCard({ projetoId, hasForeignCurrency = false }: ContasNoProjetoCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const openPanel = useCallback(() => setIsOpen(true), []);
  const closePanel = useCallback(() => setIsOpen(false), []);

  const {
    contasAtuais,
    contasAtivas,
    contasLimitadas,
    parceirosAtivos,
    historicoTotalContas,
    historicoContasLimitadas,
    historicoParceirosUnicos,
    historicoContasLista,
    historicoContasLimitadasLista,
    historicoParceirosLista,
    casasComBonus,
    contasComBonus,
    parceirosComContasVinculadas,
    casasComBonusLista,
    contasComBonusLista,
    parceirosAtivosLista,
    isLoading,
  } = useProjetoHistoricoContas(projetoId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/50 bg-card">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
      </div>
    );
  }

  return (
    <>
      {/* Compact inline strip */}
      <div 
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-card cursor-pointer hover:bg-muted/30 transition-colors group"
        onClick={openPanel}
      >
        <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        
        {hasForeignCurrency && (
          <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-500/30 text-blue-400 flex-shrink-0">
            <Globe className="h-2.5 w-2.5 mr-0.5" />
            Multi
          </Badge>
        )}

        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Contas</span>
          <span className="font-semibold text-foreground">{contasAtuais}</span>
        </div>

        <span className="text-border">|</span>

        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Limitadas</span>
          <span className={`font-semibold ${contasLimitadas > 0 ? 'text-yellow-400' : 'text-foreground'}`}>
            {contasLimitadas}
          </span>
        </div>

        <span className="text-border">|</span>

        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Parceiros</span>
          <span className="font-semibold text-foreground">{parceirosAtivos}</span>
        </div>

        <Info className="h-3 w-3 text-muted-foreground/50 ml-auto group-hover:text-muted-foreground transition-colors flex-shrink-0" />
      </div>

      {/* Overlay panel with full details */}
      <RelacionamentosOverlay isOpen={isOpen} onClose={closePanel}>
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center gap-2 pb-2 border-b border-border/50">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Painel de Relacionamentos</h3>
            {hasForeignCurrency && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/30 text-blue-400">
                <Globe className="h-2.5 w-2.5 mr-1" />
                Multi-moeda
              </Badge>
            )}
          </div>

          {/* Estado Atual */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col items-center justify-center text-center space-y-1 p-3 rounded-lg bg-muted/20">
              <div className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Contas</span>
              </div>
              <div className="text-2xl font-bold">{contasAtuais}</div>
              <div className="flex items-center justify-center gap-2 text-xs">
                <span className="text-emerald-400">{contasAtivas} ativas</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-yellow-400">{contasLimitadas} limitadas</span>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center text-center space-y-1 p-3 rounded-lg bg-muted/20">
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Parceiros</span>
              </div>
              <div className="text-2xl font-bold">{parceirosAtivos}</div>
              <div className="text-xs text-muted-foreground">ativos no projeto</div>
            </div>
          </div>

          <Separator className="bg-border/50" />

          {/* Histórico */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Histórico</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-muted/30 border-muted-foreground/20 text-muted-foreground font-normal">
                {historicoTotalContas} contas já utilizadas
              </Badge>
              {historicoContasLimitadas > 0 && (
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-destructive/10 border-destructive/20 text-destructive/80 font-normal">
                  <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                  {historicoContasLimitadas} já foram limitadas
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-muted/30 border-muted-foreground/20 text-muted-foreground font-normal">
                {historicoParceirosUnicos} parceiros únicos
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground/70 italic">
              Estes contadores nunca diminuem — representam o passado operacional do projeto.
            </p>
          </div>

          <Separator className="bg-border/50" />

          {/* Operacional */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Operacional</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center justify-center gap-1 bg-muted/20 rounded-md px-2 py-2">
                <Gift className="h-3.5 w-3.5 text-primary" />
                <div className="text-sm font-semibold">{casasComBonus}</div>
                <div className="text-[10px] text-muted-foreground leading-tight text-center">casas c/ bônus</div>
              </div>
              <div className="flex flex-col items-center justify-center gap-1 bg-muted/20 rounded-md px-2 py-2">
                <Link2 className="h-3.5 w-3.5 text-primary" />
                <div className="text-sm font-semibold">{contasComBonus}</div>
                <div className="text-[10px] text-muted-foreground leading-tight text-center">contas c/ bônus</div>
              </div>
              <div className="flex flex-col items-center justify-center gap-1 bg-muted/20 rounded-md px-2 py-2">
                <Users className="h-3.5 w-3.5 text-accent-foreground" />
                <div className="text-sm font-semibold">{parceirosComContasVinculadas}</div>
                <div className="text-[10px] text-muted-foreground leading-tight text-center">parceiros ativos</div>
              </div>
            </div>
          </div>

          {/* Histórico de parceiros */}
          {historicoParceirosLista.length > 0 && (
            <>
              <Separator className="bg-border/50" />
              <div className="space-y-1.5">
                <span className="text-[10px] font-medium text-muted-foreground">Parceiros que passaram pelo projeto</span>
                <ScrollArea className="max-h-32">
                  <div className="space-y-0.5">
                    {historicoParceirosLista.map((p) => (
                      <div key={p.id} className="text-[10px] py-0.5 font-medium">{p.nome}</div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}
        </div>
      </RelacionamentosOverlay>
    </>
  );
}
