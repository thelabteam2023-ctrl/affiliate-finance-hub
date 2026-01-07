import { useState, useCallback } from "react";
import { Download, FileSpreadsheet, FileCode, MoreVertical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useExportApostas } from "@/hooks/useExportApostas";
import type { ExportApostaRecord, ExportContext, ExportFormat } from "@/types/exportApostas";

interface ExportMenuProps {
  /** Function that returns the current visible data to export */
  getData: () => ExportApostaRecord[];
  /** Tab identifier for audit logging */
  abaOrigem: string;
  /** Base filename for export (without extension) */
  filename: string;
  /** Current filters applied (for audit) */
  filtrosAplicados?: ExportContext['filtrosAplicados'];
  /** Display variant */
  variant?: 'icon' | 'menu' | 'minimal';
  /** Size of the trigger button */
  size?: 'sm' | 'default' | 'icon';
  /** Additional CSS classes */
  className?: string;
}

/**
 * Discrete export menu component for betting data
 * 
 * Variants:
 * - 'icon': Download icon button (default)
 * - 'menu': Three-dot menu with export options
 * - 'minimal': Small download icon, shows on hover context
 * 
 * Usage:
 * ```tsx
 * <ExportMenu
 *   getData={() => apostas.map(a => transformToExportRecord(a))}
 *   abaOrigem="Surebet"
 *   filename={`surebets-${projetoId}`}
 *   filtrosAplicados={{ periodo: '30dias' }}
 * />
 * ```
 */
export function ExportMenu({
  getData,
  abaOrigem,
  filename,
  filtrosAplicados = {},
  variant = 'icon',
  size = 'icon',
  className = '',
}: ExportMenuProps) {
  const { exportToCSV, exportToXML, exporting, canExport } = useExportApostas();
  const [open, setOpen] = useState(false);

  const handleExport = useCallback(async (format: ExportFormat) => {
    const data = getData();
    const context: ExportContext = {
      abaOrigem,
      filtrosAplicados,
      totalRegistros: data.length,
    };

    if (format === 'csv') {
      await exportToCSV(data, filename, context);
    } else {
      await exportToXML(data, filename, context);
    }
    setOpen(false);
  }, [getData, abaOrigem, filename, filtrosAplicados, exportToCSV, exportToXML]);

  if (!canExport) {
    return null;
  }

  const TriggerIcon = variant === 'menu' ? MoreVertical : Download;
  const triggerSize = size === 'icon' ? 'h-8 w-8' : size === 'sm' ? 'h-7 px-2' : 'h-9 px-3';

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={exporting}
              className={`${triggerSize} text-muted-foreground hover:text-foreground ${className}`}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TriggerIcon className="h-4 w-4" />
              )}
              <span className="sr-only">Exportar dados</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Exportar dados</p>
        </TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onClick={() => handleExport('csv')}
          disabled={exporting}
          className="cursor-pointer"
        >
          <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-500" />
          <span>Exportar CSV</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => handleExport('xml')}
          disabled={exporting}
          className="cursor-pointer"
        >
          <FileCode className="mr-2 h-4 w-4 text-blue-500" />
          <span>Exportar XML</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Helper function to transform Surebet data to export format
 */
export function transformSurebetToExport(
  surebet: {
    id: string;
    data_operacao: string;
    evento: string;
    esporte?: string;
    mercado?: string | null;
    modelo?: string;
    stake_total: number;
    spread_calculado?: number | null;
    resultado?: string | null;
    status: string;
    lucro_real?: number | null;
    observacoes?: string | null;
    pernas?: Array<{
      bookmaker_nome?: string;
      selecao?: string;
      odd?: number;
      stake?: number;
    }>;
  },
  estrategia: string = 'SUREBET'
): ExportApostaRecord {
  const bookmakers = surebet.pernas?.map(p => p.bookmaker_nome).filter(Boolean).join(' / ') || '-';
  const selecoes = surebet.pernas?.map(p => p.selecao).filter(Boolean).join(' / ') || '-';
  const odds = surebet.pernas?.map(p => p.odd?.toFixed(2)).filter(Boolean).join(' / ') || '-';
  
  return {
    id: surebet.id,
    data_hora: surebet.data_operacao,
    bookmaker: bookmakers,
    estrategia,
    aba_origem: estrategia,
    evento: surebet.evento || '-',
    mercado: surebet.mercado || '-',
    selecao: selecoes,
    odd: odds,
    stake: surebet.stake_total || 0,
    retorno: surebet.lucro_real !== null ? surebet.stake_total + (surebet.lucro_real || 0) : '-',
    resultado: surebet.resultado || 'PENDENTE',
    status: surebet.status,
    lucro_prejuizo: surebet.lucro_real ?? '-',
    observacoes: surebet.observacoes || '',
  };
}

/**
 * Helper function to transform simple bet data to export format
 */
export function transformApostaToExport(
  aposta: {
    id: string;
    data_aposta: string;
    evento?: string;
    esporte?: string;
    mercado?: string | null;
    selecao?: string;
    odd?: number;
    stake?: number;
    stake_total?: number | null;
    resultado?: string | null;
    status: string;
    lucro_prejuizo?: number | null;
    valor_retorno?: number | null;
    observacoes?: string | null;
    bookmaker_nome?: string;
    estrategia?: string | null;
  },
  abaOrigem: string = 'Apostas'
): ExportApostaRecord {
  const stake = typeof aposta.stake_total === 'number' ? aposta.stake_total : (aposta.stake || 0);
  
  return {
    id: aposta.id,
    data_hora: aposta.data_aposta,
    bookmaker: aposta.bookmaker_nome || '-',
    estrategia: aposta.estrategia || '-',
    aba_origem: abaOrigem,
    evento: aposta.evento || '-',
    mercado: aposta.mercado || '-',
    selecao: aposta.selecao || '-',
    odd: aposta.odd || 0,
    stake: stake,
    retorno: aposta.valor_retorno ?? '-',
    resultado: aposta.resultado || 'PENDENTE',
    status: aposta.status,
    lucro_prejuizo: aposta.lucro_prejuizo ?? '-',
    observacoes: aposta.observacoes || '',
  };
}
