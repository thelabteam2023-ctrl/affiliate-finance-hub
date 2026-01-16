import { useState, useEffect, useMemo } from "react";
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
import { BonusDialog } from "./BonusDialog";
import { useProjectBonuses } from "@/hooks/useProjectBonuses";
import { useApostaPopup } from "@/contexts/ApostaPopupContext";

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
  saldo_usd: number;
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

/**
 * WHITELIST DE ABAS OPERACIONAIS
 * 
 * O botão "Nova Aposta" só aparece nas abas listadas abaixo.
 * Abas administrativas (Vínculos, Gestão, Ciclos) NUNCA exibem o botão.
 * 
 * REGRA: Novas abas NÃO exibem o botão por padrão.
 * Para exibir, adicione explicitamente à whitelist.
 */
const ABAS_OPERACIONAIS_APOSTA: readonly string[] = [
  "apostas",
  "freebets", 
  "bonus",
  "surebet",
  "valuebet",
  "duplogreen",
] as const;

export function GlobalActionsBar({ 
  projetoId, 
  activeTab,
  onApostaCreated, 
  onBonusCreated,
  onNavigateToTab 
}: GlobalActionsBarProps) {
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  
  // Hook do popup de apostas
  const { openApostaSimples, openApostaMultipla, openSurebet, setOnSuccessCallback } = useApostaPopup();
  
  // Verificação centralizada: botão só aparece em abas operacionais
  const showNovaApostaButton = ABAS_OPERACIONAIS_APOSTA.includes(activeTab || "");
  
  // Dialog states (apenas para bônus agora)
  const [bonusDialogOpen, setBonusDialogOpen] = useState(false);

  // Bonus hook
  const { bonuses, createBonus, saving: bonusSaving } = useProjectBonuses({ projectId: projetoId });

  const activeBonusBookmakerIds = useMemo(() => {
    return new Set(
      bonuses
        .filter((b) => b.status === "credited" && b.saldo_atual > 0)
        .map((b) => b.bookmaker_id)
    );
  }, [bonuses]);

  // IDs de bookmakers que já possuem bônus PENDENTE (não podem receber novo bônus)
  const pendingBonusBookmakerIds = useMemo(() => {
    return new Set(
      bonuses
        .filter((b) => b.status === "pending")
        .map((b) => b.bookmaker_id)
    );
  }, [bonuses]);

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
          saldo_usd,
          saldo_freebet,
          moeda,
          login_username,
          login_password_encrypted,
          bookmaker_catalogo_id,
          parceiro:parceiros (nome),
          bookmakers_catalogo (logo_url)
        `)
        .eq("projeto_id", projetoId);

      if (error) throw error;
      setBookmakers(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar bookmakers:", error.message);
    }
  };

  // Handlers para abrir popups de apostas
  const handleOpenApostaSimples = () => {
    setOnSuccessCallback(() => () => {
      onApostaCreated?.();
      toast.success("Aposta registrada com sucesso!", {
        action: onNavigateToTab ? {
          label: "Ver em Apostas",
          onClick: () => onNavigateToTab("apostas")
        } : undefined,
      });
    });
    openApostaSimples(projetoId, activeTab);
  };

  const handleOpenApostaMultipla = () => {
    setOnSuccessCallback(() => () => {
      onApostaCreated?.();
      toast.success("Aposta múltipla registrada com sucesso!", {
        action: onNavigateToTab ? {
          label: "Ver em Apostas",
          onClick: () => onNavigateToTab("apostas")
        } : undefined,
      });
    });
    openApostaMultipla(projetoId, activeTab);
  };

  const handleOpenSurebet = () => {
    setOnSuccessCallback(() => () => {
      onApostaCreated?.();
      toast.success("Surebet registrada com sucesso!", {
        action: onNavigateToTab ? {
          label: "Ver em Apostas",
          onClick: () => onNavigateToTab("apostas")
        } : undefined,
      });
    });
    openSurebet(projetoId, activeTab);
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

  // Transform bookmakers for BonusDialog format (hide bookmakers that already have an active OR pending bonus)
  const bookmarkersForBonus = bookmakers
    .filter((b) => !activeBonusBookmakerIds.has(b.id) && !pendingBonusBookmakerIds.has(b.id))
    .map((b) => ({
      id: b.id,
      nome: b.nome,
      login_username: b.login_username || "",
      login_password_encrypted: b.login_password_encrypted,
      logo_url: b.bookmakers_catalogo?.logo_url,
      bookmaker_catalogo_id: b.bookmaker_catalogo_id,
      saldo_atual: b.saldo_atual ?? 0,
      saldo_usd: b.saldo_usd ?? 0,
      moeda: b.moeda || "BRL",
      parceiro_nome: b.parceiro?.nome,
    }));

  return (
    <>
      {/* Actions Bar */}
      <div className="flex items-center gap-2">
        {/* Nova Aposta Dropdown - APENAS em abas operacionais (whitelist) */}
        {showNovaApostaButton && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-9">
                <Plus className="mr-1 h-4 w-4" />
                Nova Aposta
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={handleOpenApostaSimples}>
                <Target className="mr-2 h-4 w-4" />
                Aposta Simples
              </DropdownMenuItem>
              {/* Ocultar Aposta Múltipla na aba Duplo Green e Surebet */}
              {activeTab !== "duplogreen" && activeTab !== "surebet" && (
                <DropdownMenuItem onClick={handleOpenApostaMultipla}>
                  <Layers className="mr-2 h-4 w-4" />
                  Aposta Múltipla
                </DropdownMenuItem>
              )}
              {/* Ocultar Surebet na aba ValueBet */}
              {activeTab !== "valuebet" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleOpenSurebet}>
                    <ArrowLeftRight className="mr-2 h-4 w-4" />
                    Surebet
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

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

      {/* Bonus Dialog - único que permanece como Dialog tradicional */}
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
