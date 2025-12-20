import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Plus, 
  Target, 
  Layers, 
  ArrowLeftRight,
  Coins,
  ChevronDown
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ApostaDialog } from "./ApostaDialog";
import { ApostaMultiplaDialog } from "./ApostaMultiplaDialog";
import { SurebetDialog } from "./SurebetDialog";
import { BonusDialog } from "./BonusDialog";
import { useProjectBonuses } from "@/hooks/useProjectBonuses";
import { getEstrategiaFromTab, type ApostaEstrategia } from "@/lib/apostaConstants";

interface GlobalActionsBarProps {
  projetoId: string;
  activeTab?: string;
  onApostaCreated?: () => void;
  onBonusCreated?: () => void;
  onNavigateToTab?: (tab: string) => void;
}

interface Bookmaker {
  id: string;
  nome: string;
  saldo_atual: number;
  saldo_freebet: number;
  moeda: string;
  login_username?: string;
  login_password_encrypted?: string | null;
  bookmaker_catalogo_id?: string | null;
  parceiro?: {
    nome: string;
  };
  bookmakers_catalogo?: {
    logo_url: string | null;
  } | null;
}

export function GlobalActionsBar({ 
  projetoId, 
  activeTab,
  onApostaCreated, 
  onBonusCreated,
  onNavigateToTab 
}: GlobalActionsBarProps) {
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  
  // Dialog states
  const [apostaDialogOpen, setApostaDialogOpen] = useState(false);
  const [multiplaDialogOpen, setMultiplaDialogOpen] = useState(false);
  const [surebetDialogOpen, setSurebetDialogOpen] = useState(false);
  const [bonusDialogOpen, setBonusDialogOpen] = useState(false);

  // Bonus hook
  const { createBonus, saving: bonusSaving } = useProjectBonuses({ projectId: projetoId });

  useEffect(() => {
    fetchBookmakers();
  }, [projetoId]);

  const fetchBookmakers = async () => {
    try {
      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          saldo_atual,
          saldo_freebet,
          moeda,
          login_username,
          login_password_encrypted,
          bookmaker_catalogo_id,
          parceiro:parceiros (nome),
          bookmakers_catalogo (logo_url)
        `)
        .eq("projeto_id", projetoId)
        .in("status", ["ativo", "ATIVO", "LIMITADA", "limitada"]);

      if (error) throw error;
      setBookmakers(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar bookmakers:", error.message);
    }
  };

  const handleApostaSuccess = () => {
    setApostaDialogOpen(false);
    onApostaCreated?.();
    
    toast.success("Aposta registrada com sucesso!", {
      action: onNavigateToTab ? {
        label: "Ver em Apostas",
        onClick: () => onNavigateToTab("apostas")
      } : undefined,
    });
  };

  const handleMultiplaSuccess = () => {
    setMultiplaDialogOpen(false);
    onApostaCreated?.();
    
    toast.success("Aposta múltipla registrada com sucesso!", {
      action: onNavigateToTab ? {
        label: "Ver em Apostas",
        onClick: () => onNavigateToTab("apostas")
      } : undefined,
    });
  };

  const handleSurebetSuccess = () => {
    setSurebetDialogOpen(false);
    onApostaCreated?.();
    
    toast.success("Surebet registrada com sucesso!", {
      action: onNavigateToTab ? {
        label: "Ver em Apostas",
        onClick: () => onNavigateToTab("apostas")
      } : undefined,
    });
  };

  const handleBonusSubmit = async (data: any) => {
    const success = await createBonus(data);
    if (success) {
      setBonusDialogOpen(false);
      onBonusCreated?.();
      
      toast.success("Bônus registrado com sucesso!", {
        action: onNavigateToTab ? {
          label: "Ver em Bônus",
          onClick: () => onNavigateToTab("bonus")
        } : undefined,
      });
    }
    return success;
  };

  // Transform bookmakers for BonusDialog format
  const bookmarkersForBonus = bookmakers.map(b => ({
    id: b.id,
    nome: b.nome,
    login_username: b.login_username || "",
    login_password_encrypted: b.login_password_encrypted,
    logo_url: b.bookmakers_catalogo?.logo_url,
    bookmaker_catalogo_id: b.bookmaker_catalogo_id,
  }));

  return (
    <>
      {/* Actions Bar */}
      <div className="flex items-center gap-2">
        {/* Nova Aposta Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="h-9">
              <Plus className="mr-1 h-4 w-4" />
              Nova Aposta
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setApostaDialogOpen(true)}>
              <Target className="mr-2 h-4 w-4" />
              Aposta Simples
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMultiplaDialogOpen(true)}>
              <Layers className="mr-2 h-4 w-4" />
              Aposta Múltipla
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSurebetDialogOpen(true)}>
              <ArrowLeftRight className="mr-2 h-4 w-4" />
              Surebet
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Novo Bônus Button - only visible on Bônus tab */}
        {activeTab === "bonus" && (
          <Button 
            variant="outline" 
            size="sm" 
            className="h-9"
            onClick={() => setBonusDialogOpen(true)}
          >
            <Coins className="mr-1 h-4 w-4" />
            Novo Bônus
          </Button>
        )}
      </div>

      {/* Dialogs */}
      <ApostaDialog
        open={apostaDialogOpen}
        onOpenChange={setApostaDialogOpen}
        aposta={null}
        projetoId={projetoId}
        onSuccess={handleApostaSuccess}
        defaultEstrategia={getEstrategiaFromTab(activeTab || 'apostas')}
      />

      <ApostaMultiplaDialog
        open={multiplaDialogOpen}
        onOpenChange={setMultiplaDialogOpen}
        aposta={null}
        projetoId={projetoId}
        onSuccess={handleMultiplaSuccess}
        defaultEstrategia={getEstrategiaFromTab(activeTab || 'apostas')}
      />

      <SurebetDialog
        open={surebetDialogOpen}
        onOpenChange={setSurebetDialogOpen}
        projetoId={projetoId}
        bookmakers={bookmakers}
        surebet={null}
        onSuccess={handleSurebetSuccess}
      />

      <BonusDialog
        open={bonusDialogOpen}
        onOpenChange={setBonusDialogOpen}
        projectId={projetoId}
        bookmakers={bookmarkersForBonus}
        saving={bonusSaving}
        onSubmit={handleBonusSubmit}
      />
    </>
  );
}
