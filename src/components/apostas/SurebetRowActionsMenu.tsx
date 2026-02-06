import { useState, useMemo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  MoreVertical,
  Pencil,
  Copy,
  CheckCircle2,
  Trash2,
  Trophy,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SurebetPernaInfo {
  id: string;
  ordem: number;
  selecao: string;
  bookmaker_nome: string;
}

export interface SurebetQuickResult {
  /** Pernas que ganharam (índices 0-based) */
  winners: number[];
  /** Tipo do resultado final */
  type: "single_win" | "double_green" | "all_void";
  /** Label amigável */
  label: string;
}

interface SurebetRowActionsMenuProps {
  surebetId: string;
  status: string;
  resultado: string | null;
  pernas: SurebetPernaInfo[];
  onEdit: () => void;
  onDuplicate?: () => void;
  onQuickResolve: (result: SurebetQuickResult) => void;
  onDelete: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Gera todas as combinações possíveis de resultados para uma Surebet:
 * - Perna N Win (outras perdem)
 * - Duplo Green: combinações de 2 pernas que ganham (se modelo >= 3)
 * - Void Total
 */
function generateQuickResultOptions(pernas: SurebetPernaInfo[]): SurebetQuickResult[] {
  const options: SurebetQuickResult[] = [];
  const n = pernas.length;
  
  if (n < 2) return options;
  
  // Opções de uma perna ganhando (as outras perdem)
  for (let i = 0; i < n; i++) {
    const pernaLabel = pernas[i].selecao || `Perna ${i + 1}`;
    const bookmakerShort = pernas[i].bookmaker_nome.split(' - ')[0].substring(0, 12);
    options.push({
      winners: [i],
      type: "single_win",
      label: `${bookmakerShort} Win`,
    });
  }
  
  // Se tem 3+ pernas, adicionar combinações de Duplo Green
  if (n >= 3) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const bk1 = pernas[i].bookmaker_nome.split(' - ')[0].substring(0, 8);
        const bk2 = pernas[j].bookmaker_nome.split(' - ')[0].substring(0, 8);
        options.push({
          winners: [i, j],
          type: "double_green",
          label: `${bk1} + ${bk2}`,
        });
      }
    }
  }
  
  // Void total (todas as apostas canceladas)
  options.push({
    winners: [],
    type: "all_void",
    label: "Void Total",
  });
  
  return options;
}

export function SurebetRowActionsMenu({
  surebetId,
  status,
  resultado,
  pernas,
  onEdit,
  onDuplicate,
  onQuickResolve,
  onDelete,
  disabled = false,
  className,
}: SurebetRowActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const quickOptions = useMemo(() => generateQuickResultOptions(pernas), [pernas]);
  
  // Separar opções por tipo para organizar o submenu
  const singleWinOptions = quickOptions.filter(o => o.type === "single_win");
  const doubleGreenOptions = quickOptions.filter(o => o.type === "double_green");
  const voidOption = quickOptions.find(o => o.type === "all_void");
  
  const handleAction = (action: () => void) => {
    setIsOpen(false);
    setTimeout(() => action(), 0);
  };
  
  const handleQuickResolve = (result: SurebetQuickResult) => {
    setIsOpen(false);
    setTimeout(() => {
      try {
        onQuickResolve(result);
      } catch (err) {
        console.error('[SurebetRowActionsMenu] Erro ao chamar onQuickResolve:', err);
      }
    }, 0);
  };
  
  const isLiquidada = status === "LIQUIDADA";

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 text-muted-foreground hover:text-foreground transition-colors",
            "opacity-60 hover:opacity-100",
            className
          )}
          onClick={(e) => e.stopPropagation()}
          disabled={disabled}
        >
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Ações</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="min-w-[180px] bg-popover"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {/* Editar */}
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleAction(onEdit); }}>
          <Pencil className="h-4 w-4 mr-2" />
          Editar
        </DropdownMenuItem>

        {/* Duplicar */}
        {onDuplicate && (
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleAction(onDuplicate); }}>
            <Copy className="h-4 w-4 mr-2" />
            Duplicar
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        {/* Submenu de Liquidação Rápida */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Liquidar
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent 
            className="min-w-[180px] max-h-[320px] overflow-y-auto bg-popover"
          >
            {/* Single Win Options */}
            <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Trophy className="h-3 w-3" />
              Uma perna ganha
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              {singleWinOptions.map((option, idx) => (
                <DropdownMenuItem
                  key={`single-${idx}`}
                  onSelect={(e) => { e.preventDefault(); handleQuickResolve(option); }}
                  className="text-emerald-400 focus:text-emerald-400 focus:bg-emerald-500/10"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            
            {/* Double Green Options (se existirem) */}
            {doubleGreenOptions.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Layers className="h-3 w-3" />
                  Duplo Green
                </DropdownMenuLabel>
                <DropdownMenuGroup>
                  {doubleGreenOptions.map((option, idx) => (
                    <DropdownMenuItem
                      key={`double-${idx}`}
                      onSelect={(e) => { e.preventDefault(); handleQuickResolve(option); }}
                      className="text-teal-400 focus:text-teal-400 focus:bg-teal-500/10"
                    >
                      <Layers className="h-4 w-4 mr-2" />
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}
            
            {/* Void Total */}
            {voidOption && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => { e.preventDefault(); handleQuickResolve(voidOption); }}
                  className="text-gray-400 focus:text-gray-400 focus:bg-gray-500/10"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {voidOption.label}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        {/* Excluir */}
        <DropdownMenuItem
          onSelect={(e) => { e.preventDefault(); handleAction(onDelete); }}
          className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
