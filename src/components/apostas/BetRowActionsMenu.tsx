import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  MoreVertical,
  Pencil,
  Copy,
  CheckCircle2,
  X,
  CircleSlash,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type BetResultado = "GREEN" | "RED" | "MEIO_GREEN" | "MEIO_RED" | "VOID";

export interface BetRowActionsMenuProps {
  /** ID da aposta */
  apostaId: string;
  /** Tipo da aposta para contexto */
  apostaType: "simples" | "multipla" | "surebet";
  /** Status atual (PENDENTE/LIQUIDADA) */
  status: string;
  /** Resultado atual */
  resultado: string | null;
  /** Callback para abrir edição */
  onEdit: () => void;
  /** Callback para duplicar */
  onDuplicate?: () => void;
  /** Callback para liquidação rápida */
  onQuickResolve: (resultado: BetResultado) => void;
  /** Callback para excluir (abre modal de confirmação) */
  onDelete: () => void;
  /** Desabilitar ações */
  disabled?: boolean;
  /** Classes adicionais */
  className?: string;
}

const RESULTADO_OPTIONS: {
  value: BetResultado;
  label: string;
  icon: typeof CheckCircle2;
  className: string;
}[] = [
  { value: "GREEN", label: "Green", icon: CheckCircle2, className: "text-emerald-400 focus:text-emerald-400 focus:bg-emerald-500/10" },
  { value: "RED", label: "Red", icon: X, className: "text-red-400 focus:text-red-400 focus:bg-red-500/10" },
  { value: "MEIO_GREEN", label: "½ Green", icon: CheckCircle2, className: "text-teal-400 focus:text-teal-400 focus:bg-teal-500/10" },
  { value: "MEIO_RED", label: "½ Red", icon: X, className: "text-orange-400 focus:text-orange-400 focus:bg-orange-500/10" },
  { value: "VOID", label: "Void", icon: CircleSlash, className: "text-gray-400 focus:text-gray-400 focus:bg-gray-500/10" },
];

export function BetRowActionsMenu({
  apostaId,
  apostaType,
  status,
  resultado,
  onEdit,
  onDuplicate,
  onQuickResolve,
  onDelete,
  disabled = false,
  className,
}: BetRowActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleAction = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  const handleQuickResolve = (novoResultado: BetResultado) => {
    console.log('[BetRowActionsMenu] handleQuickResolve chamado:', { apostaId, novoResultado, currentResultado: resultado });
    try {
      onQuickResolve(novoResultado);
    } catch (err) {
      console.error('[BetRowActionsMenu] Erro ao chamar onQuickResolve:', err);
    }
    setIsOpen(false);
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
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
        className="min-w-[160px]"
      >
        {/* Editar */}
        <DropdownMenuItem onSelect={() => handleAction(onEdit)}>
          <Pencil className="h-4 w-4 mr-2" />
          Editar
        </DropdownMenuItem>

        {/* Duplicar (opcional) */}
        {onDuplicate && (
          <DropdownMenuItem onSelect={() => handleAction(onDuplicate)}>
            <Copy className="h-4 w-4 mr-2" />
            Duplicar
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        {/* Submenu de Status */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Alterar Resultado
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {RESULTADO_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isCurrentResult = resultado === option.value;
              return (
                <DropdownMenuItem
                  key={option.value}
                  onSelect={() => handleQuickResolve(option.value)}
                  onClick={() => {
                    console.log('[BetRowActionsMenu] onClick direto:', option.value);
                    handleQuickResolve(option.value);
                  }}
                  className={cn(option.className, isCurrentResult && "bg-muted/50")}
                  disabled={isCurrentResult}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {option.label}
                  {isCurrentResult && (
                    <span className="ml-auto text-xs opacity-60">(atual)</span>
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        {/* Excluir (abre modal) */}
        <DropdownMenuItem
          onSelect={() => handleAction(onDelete)}
          className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
