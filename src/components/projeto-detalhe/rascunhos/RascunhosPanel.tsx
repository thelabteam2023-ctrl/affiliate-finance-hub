import { useState, useMemo, useCallback } from "react";
import { useApostaRascunho, type ApostaRascunho, type TipoRascunho } from "@/hooks/useApostaRascunho";
import { RascunhoCard } from "./RascunhoCard";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription,
  SheetFooter 
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  FileText, 
  Trash2, 
  Layers, 
  ArrowLeftRight, 
  CircleDot,
  Shield,
  Inbox
} from "lucide-react";
import { toast } from "sonner";

interface RascunhosPanelProps {
  projetoId: string;
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinuarSurebet?: (rascunho: ApostaRascunho) => void;
  onContinuarMultipla?: (rascunho: ApostaRascunho) => void;
  onContinuarSimples?: (rascunho: ApostaRascunho) => void;
}

const tipoIcons: Record<TipoRascunho, React.ReactNode> = {
  SUREBET: <ArrowLeftRight className="h-4 w-4" />,
  MULTIPLA: <Layers className="h-4 w-4" />,
  SIMPLES: <CircleDot className="h-4 w-4" />,
  HEDGE: <Shield className="h-4 w-4" />,
};

const tipoLabels: Record<TipoRascunho, string> = {
  SUREBET: "Surebets",
  MULTIPLA: "Múltiplas",
  SIMPLES: "Simples",
  HEDGE: "Hedges",
};

export function RascunhosPanel({
  projetoId,
  workspaceId,
  open,
  onOpenChange,
  onContinuarSurebet,
  onContinuarMultipla,
  onContinuarSimples,
}: RascunhosPanelProps) {
  const { rascunhos, deletarRascunho, limparTodos } = useApostaRascunho(projetoId, workspaceId);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<TipoRascunho | "TODOS">("TODOS");

  // Agrupar rascunhos por tipo
  const rascunhosPorTipo = useMemo(() => {
    const grupos: Record<TipoRascunho, ApostaRascunho[]> = {
      SUREBET: [],
      MULTIPLA: [],
      SIMPLES: [],
      HEDGE: [],
    };
    
    rascunhos.forEach(r => {
      if (grupos[r.tipo]) {
        grupos[r.tipo].push(r);
      }
    });
    
    return grupos;
  }, [rascunhos]);

  // Contadores por tipo
  const contadores = useMemo(() => {
    return {
      TODOS: rascunhos.length,
      SUREBET: rascunhosPorTipo.SUREBET.length,
      MULTIPLA: rascunhosPorTipo.MULTIPLA.length,
      SIMPLES: rascunhosPorTipo.SIMPLES.length,
      HEDGE: rascunhosPorTipo.HEDGE.length,
    };
  }, [rascunhos, rascunhosPorTipo]);

  // Rascunhos filtrados pela tab ativa
  const rascunhosFiltrados = useMemo(() => {
    if (activeTab === "TODOS") return rascunhos;
    return rascunhosPorTipo[activeTab] || [];
  }, [activeTab, rascunhos, rascunhosPorTipo]);

  // Handler para continuar um rascunho
  const handleContinuar = useCallback((rascunho: ApostaRascunho) => {
    switch (rascunho.tipo) {
      case "SUREBET":
        if (onContinuarSurebet) {
          onContinuarSurebet(rascunho);
          onOpenChange(false);
        } else {
          toast.error("Funcionalidade de surebet não disponível");
        }
        break;
      case "MULTIPLA":
        if (onContinuarMultipla) {
          onContinuarMultipla(rascunho);
          onOpenChange(false);
        } else {
          toast.error("Funcionalidade de múltipla não disponível");
        }
        break;
      case "SIMPLES":
      case "HEDGE":
        if (onContinuarSimples) {
          onContinuarSimples(rascunho);
          onOpenChange(false);
        } else {
          toast.error("Funcionalidade não disponível ainda");
        }
        break;
    }
  }, [onContinuarSurebet, onContinuarMultipla, onContinuarSimples, onOpenChange]);

  // Handler para deletar
  const handleDeletar = useCallback((id: string) => {
    setDeleteConfirmId(id);
  }, []);

  const confirmDeletar = useCallback(() => {
    if (deleteConfirmId) {
      deletarRascunho(deleteConfirmId);
      toast.success("Rascunho excluído");
      setDeleteConfirmId(null);
    }
  }, [deleteConfirmId, deletarRascunho]);

  // Handler para limpar todos
  const handleLimparTodos = useCallback(() => {
    setClearAllConfirm(true);
  }, []);

  const confirmLimparTodos = useCallback(() => {
    limparTodos();
    toast.success("Todos os rascunhos foram excluídos");
    setClearAllConfirm(false);
  }, [limparTodos]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Rascunhos
            </SheetTitle>
            <SheetDescription>
              {rascunhos.length === 0 
                ? "Nenhum rascunho salvo"
                : `${rascunhos.length} rascunho${rascunhos.length > 1 ? 's' : ''} salvo${rascunhos.length > 1 ? 's' : ''}`
              }
            </SheetDescription>
          </SheetHeader>

          {rascunhos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Inbox className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-center">
                Nenhum rascunho salvo.
                <br />
                <span className="text-sm">
                  Apostas incompletas podem ser salvas como rascunho.
                </span>
              </p>
            </div>
          ) : (
            <>
              <Tabs 
                value={activeTab} 
                onValueChange={(v) => setActiveTab(v as TipoRascunho | "TODOS")}
                className="mt-4"
              >
                <TabsList className="w-full">
                  <TabsTrigger value="TODOS" className="flex-1">
                    Todos ({contadores.TODOS})
                  </TabsTrigger>
                  {contadores.SUREBET > 0 && (
                    <TabsTrigger value="SUREBET" className="flex-1">
                      {tipoIcons.SUREBET}
                      <span className="ml-1">{contadores.SUREBET}</span>
                    </TabsTrigger>
                  )}
                  {contadores.MULTIPLA > 0 && (
                    <TabsTrigger value="MULTIPLA" className="flex-1">
                      {tipoIcons.MULTIPLA}
                      <span className="ml-1">{contadores.MULTIPLA}</span>
                    </TabsTrigger>
                  )}
                  {contadores.SIMPLES > 0 && (
                    <TabsTrigger value="SIMPLES" className="flex-1">
                      {tipoIcons.SIMPLES}
                      <span className="ml-1">{contadores.SIMPLES}</span>
                    </TabsTrigger>
                  )}
                </TabsList>

                <ScrollArea className="h-[calc(100vh-280px)] mt-4">
                  <div className="space-y-3 pr-4">
                    {rascunhosFiltrados.map(rascunho => (
                      <RascunhoCard
                        key={rascunho.id}
                        rascunho={rascunho}
                        onContinuar={handleContinuar}
                        onDeletar={handleDeletar}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </Tabs>

              <SheetFooter className="mt-4">
                <Button
                  variant="destructive"
                  onClick={handleLimparTodos}
                  className="w-full"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Limpar Todos os Rascunhos
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirmação de exclusão individual */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir rascunho?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O rascunho será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeletar}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de limpar todos */}
      <AlertDialog open={clearAllConfirm} onOpenChange={setClearAllConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar todos os rascunhos?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os {rascunhos.length} rascunhos serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLimparTodos} className="bg-destructive">
              Limpar Todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
