/**
 * Painel de Parceiros do Projeto - Versão Compacta
 * 
 * Strip horizontal: Parceiros ativos X | Histórico Y
 * Popover sob demanda com listas de parceiros ativos e históricos.
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users,
  History,
  Globe,
  Info,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useProjetoHistoricoContas } from "@/hooks/useProjetoHistoricoContas";
import { createPortal } from "react-dom";

/** Retorna "Primeiro Último" em Title Case */
function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  const pick = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return pick.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

interface ContasNoProjetoCardProps {
  projetoId: string;
  hasForeignCurrency?: boolean;
}

/** Overlay centralizado para detalhes de parceiros */
function ParceirosOverlay({
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
        style={{ width: "min(440px, 90vw)", maxHeight: "70vh" }}
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
  const [showHistorico, setShowHistorico] = useState(false);
  const openPanel = useCallback(() => setIsOpen(true), []);
  const closePanel = useCallback(() => setIsOpen(false), []);

  const {
    parceirosAtivos,
    historicoParceirosUnicos,
    parceirosAtivosLista,
    historicoParceirosLista,
    isLoading,
  } = useProjetoHistoricoContas(projetoId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/50 bg-card">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
    );
  }

  // Parceiros históricos = todos que passaram menos os atualmente ativos
  const parceirosAtivosIds = new Set(parceirosAtivosLista.map(p => p.id));
  const parceirosHistoricos = historicoParceirosLista.filter(p => !parceirosAtivosIds.has(p.id));

  return (
    <>
      {/* Compact inline strip */}
      <div 
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-card cursor-pointer hover:bg-muted/30 transition-colors group"
        onClick={openPanel}
      >
        <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />


        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Parceiros</span>
          <span className="font-semibold text-foreground">{parceirosAtivos}</span>
        </div>

        <span className="text-border">|</span>

        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Histórico</span>
          <span className="font-semibold text-foreground">{historicoParceirosUnicos}</span>
        </div>

        <Info className="h-3 w-3 text-muted-foreground/50 ml-auto group-hover:text-muted-foreground transition-colors flex-shrink-0" />
      </div>

      {/* Overlay panel */}
      <ParceirosOverlay isOpen={isOpen} onClose={closePanel}>
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center gap-2 pb-2 border-b border-border/50">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Parceiros do Projeto</h3>
          </div>

          {/* Parceiros Ativos */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">
                Parceiros Ativos ({parceirosAtivosLista.length})
              </span>
            </div>
            {parceirosAtivosLista.length > 0 ? (
              <ScrollArea className="max-h-28">
                <div className="space-y-1">
                  {parceirosAtivosLista.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs py-1 px-2 rounded-md bg-muted/20">
                      <span className="font-medium truncate">{shortName(p.nome)}</span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-2">
                        {p.totalContas} {p.totalContas === 1 ? 'conta' : 'contas'}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-[10px] text-muted-foreground/60 italic px-2">Nenhum parceiro ativo no momento.</p>
            )}
          </div>

          <Separator className="bg-border/50" />

          {/* Histórico - colapsável */}
          <div className="space-y-2">
            <button
              onClick={() => setShowHistorico(!showHistorico)}
              className="flex items-center gap-1.5 w-full text-left group/hist"
            >
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                Histórico ({historicoParceirosLista.length} parceiros)
              </span>
              {showHistorico ? (
                <ChevronUp className="h-3 w-3 text-muted-foreground ml-auto" />
              ) : (
                <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />
              )}
            </button>
            {showHistorico && historicoParceirosLista.length > 0 && (
              <ScrollArea className="max-h-32">
                <div className="space-y-1">
                  {historicoParceirosLista.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs py-1 px-2 rounded-md bg-muted/10">
                      <span className={`font-medium truncate ${parceirosAtivosIds.has(p.id) ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {shortName(p.nome)}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="text-[10px] text-muted-foreground">
                          {p.totalContas} {p.totalContas === 1 ? 'conta' : 'contas'}
                        </span>
                        {parceirosAtivosIds.has(p.id) && (
                          <Badge variant="outline" className="text-[8px] px-1 py-0 border-primary/30 text-primary">
                            ativo
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
            {showHistorico && historicoParceirosLista.length === 0 && (
              <p className="text-[10px] text-muted-foreground/60 italic px-2">Nenhum parceiro registrado.</p>
            )}
          </div>
        </div>
      </ParceirosOverlay>
    </>
  );
}
