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
import { generateLiquidationOptions } from "@/utils/surebetLiquidationUtils";
import { SurebetPerna } from "@/components/projeto-detalhe/SurebetCard";

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
  /** IDs das entradas específicas (para sub-entradas) */
  entryIds?: string[];
}

interface SurebetRowActionsMenuProps {
  surebetId: string;
  status: string;
  resultado: string | null;
  pernas: SurebetPerna[]; // MUDANÇA: Recebe SurebetPerna real para expansão
  onEdit: () => void;
  onDuplicate?: () => void;
  onQuickResolve: (result: SurebetQuickResult) => void;
  onDelete: () => void;
  disabled?: boolean;
  className?: string;
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
  
  // USAR GERADOR DE OPÇÕES CANÔNICO QUE TRATA SUB-ENTRADAS
  const liquidationOptions = useMemo(() => generateLiquidationOptions(pernas), [pernas]);
  
  const handleAction = (action: () => void) => {
    action();
    setIsOpen(false);
  };
  
  const handleQuickResolve = (type: "single_win" | "double_green" | "all_void", option: any) => {
    setIsOpen(false);
    
    const result: SurebetQuickResult = {
      type,
      label: option.label,
      winners: [],
      entryIds: []
    };

    if (type === 'single_win') {
      result.winners = [option.legIndex];
      result.entryIds = option.houses.map((h: any) => h.entryId);
    } else if (type === 'double_green') {
      result.winners = [option.leg1.legIndex, option.leg2.legIndex];
      result.entryIds = [
        ...option.leg1.houses.map((h: any) => h.entryId),
        ...option.leg2.houses.map((h: any) => h.entryId)
      ];
    }

    setTimeout(() => {
      try {
        onQuickResolve(result);
      } catch (err) {
        console.error('[SurebetRowActionsMenu] Erro ao chamar onQuickResolve:', err);
      }
    }, 0);
  };
  
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
          data-testid="surebet-actions-trigger"
        >
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Ações</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="min-w-[180px] bg-popover"
        onCloseAutoFocus={(e) => e.preventDefault()}
        data-testid="liquidation-menu"
        data-operation-id={surebetId}
      >
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleAction(onEdit); }}>
          <Pencil className="h-4 w-4 mr-2" />
          Editar
        </DropdownMenuItem>

        {onDuplicate && (
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleAction(onDuplicate); }}>
            <Copy className="h-4 w-4 mr-2" />
            Duplicar
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Liquidar
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent 
            className="min-w-[180px] max-h-[320px] overflow-y-auto bg-popover"
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Trophy className="h-3 w-3" />
              Uma perna ganha
            </DropdownMenuLabel>
            <DropdownMenuGroup data-testid="liquidation-section-single">
              {liquidationOptions.singleWin.map((option) => (
                <DropdownMenuItem
                  key={option.legId}
                  onSelect={(e) => { e.preventDefault(); handleQuickResolve('single_win', option); }}
                  className="text-emerald-400 focus:text-emerald-400 focus:bg-emerald-500/10"
                  data-testid={`liquidate-leg-${option.legIndex}`}
                  data-leg-id={option.legId}
                  data-has-multiple-houses={option.hasMultipleHouses ? 'true' : 'false'}
                  data-house-count={option.houseCount}
                  data-pnl-projection={option.pnl?.toFixed(2)}
                  data-houses={option.houses.map(h => h.casa).join(',')}
                  title={option.hasMultipleHouses ? option.houses.map(h => `${h.casa}: ${h.stake} ${h.currency}`).join('\n') : undefined}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {option.label}
                  {option.hasMultipleHouses && (
                    <span style={{ opacity: 0.6, fontSize: '0.75em', marginLeft: '4px' }}>
                      ({option.houseCount} casas)
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            
            {liquidationOptions.doubleGreen.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Layers className="h-3 w-3" />
                  Duplo Green
                </DropdownMenuLabel>
                <DropdownMenuGroup data-testid="liquidation-section-double">
                  {liquidationOptions.doubleGreen.map((option) => (
                    <DropdownMenuItem
                      key={option.legIds.join('+')}
                      onSelect={(e) => { e.preventDefault(); handleQuickResolve('double_green', option); }}
                      className="text-teal-400 focus:text-teal-400 focus:bg-teal-500/10"
                      data-testid={`liquidate-double-${option.legIds.join('-')}`}
                      data-leg-ids={option.legIds.join(',')}
                      data-pnl-projection={option.pnl?.toFixed(2)}
                    >
                      <Layers className="h-4 w-4 mr-2" />
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}
            
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => { e.preventDefault(); handleQuickResolve('all_void', liquidationOptions.voidTotal[0]); }}
              className="text-gray-400 focus:text-gray-400 focus:bg-gray-500/10"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Void Total
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

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
