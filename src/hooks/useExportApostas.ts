import { useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useWorkspace } from "./useWorkspace";
import { usePermission } from "./usePermission";
import type { 
  ExportApostaRecord, 
  ExportFormat, 
  ExportContext, 
  UseExportApostasReturn,
  CSV_HEADERS 
} from "@/types/exportApostas";

// CSV Headers mapping
const HEADERS: Record<keyof ExportApostaRecord, string> = {
  id: 'ID',
  data_hora: 'Data/Hora',
  projeto_nome: 'Projeto',
  bookmaker: 'Casa',
  estrategia: 'Estratégia',
  aba_origem: 'Aba Origem',
  evento: 'Evento',
  mercado: 'Mercado',
  selecao: 'Seleção',
  odd: 'Odd',
  stake: 'Stake',
  retorno: 'Retorno',
  resultado: 'Resultado',
  status: 'Status',
  lucro_prejuizo: 'Lucro/Prejuízo',
  observacoes: 'Observações',
};

// Escape CSV value (handles commas, quotes, newlines)
function escapeCSV(value: string | number | undefined | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // If contains special chars, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Format value for display (numbers with proper formatting)
function formatValue(key: keyof ExportApostaRecord, value: unknown): string {
  if (value === null || value === undefined) return '';
  
  if (['odd', 'stake', 'retorno', 'lucro_prejuizo'].includes(key)) {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    // Format with 2 decimal places, using comma as decimal separator for BR
    return num.toFixed(2).replace('.', ',');
  }
  
  return String(value);
}

// Generate CSV content from records
function generateCSV(records: ExportApostaRecord[]): string {
  if (records.length === 0) return '';
  
  // Column order for export
  const columns: (keyof ExportApostaRecord)[] = [
    'id', 'data_hora', 'bookmaker', 'estrategia', 'aba_origem',
    'evento', 'mercado', 'selecao', 'odd', 'stake', 'retorno',
    'resultado', 'status', 'lucro_prejuizo', 'observacoes'
  ];
  
  // Header row
  const header = columns.map(col => escapeCSV(HEADERS[col])).join(';');
  
  // Data rows
  const rows = records.map(record => 
    columns.map(col => escapeCSV(formatValue(col, record[col]))).join(';')
  );
  
  // BOM for UTF-8 (Excel compatibility)
  return '\uFEFF' + [header, ...rows].join('\r\n');
}

// Generate XML content from records
function generateXML(records: ExportApostaRecord[], context: ExportContext): string {
  if (records.length === 0) return '';
  
  const xmlEscape = (str: string | number | undefined | null): string => {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };
  
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ExportacaoApostas>',
    '  <Metadata>',
    `    <AbaOrigem>${xmlEscape(context.abaOrigem)}</AbaOrigem>`,
    `    <DataExportacao>${new Date().toISOString()}</DataExportacao>`,
    `    <TotalRegistros>${records.length}</TotalRegistros>`,
    '  </Metadata>',
    '  <Apostas>',
  ];
  
  records.forEach(record => {
    lines.push('    <Aposta>');
    lines.push(`      <ID>${xmlEscape(record.id)}</ID>`);
    lines.push(`      <DataHora>${xmlEscape(record.data_hora)}</DataHora>`);
    lines.push(`      <Bookmaker>${xmlEscape(record.bookmaker)}</Bookmaker>`);
    lines.push(`      <Estrategia>${xmlEscape(record.estrategia)}</Estrategia>`);
    lines.push(`      <Evento>${xmlEscape(record.evento)}</Evento>`);
    lines.push(`      <Mercado>${xmlEscape(record.mercado)}</Mercado>`);
    lines.push(`      <Selecao>${xmlEscape(record.selecao)}</Selecao>`);
    lines.push(`      <Odd>${xmlEscape(record.odd)}</Odd>`);
    lines.push(`      <Stake>${xmlEscape(record.stake)}</Stake>`);
    lines.push(`      <Retorno>${xmlEscape(record.retorno)}</Retorno>`);
    lines.push(`      <Resultado>${xmlEscape(record.resultado)}</Resultado>`);
    lines.push(`      <Status>${xmlEscape(record.status)}</Status>`);
    lines.push(`      <LucroPrejuizo>${xmlEscape(record.lucro_prejuizo)}</LucroPrejuizo>`);
    if (record.observacoes) {
      lines.push(`      <Observacoes>${xmlEscape(record.observacoes)}</Observacoes>`);
    }
    lines.push('    </Aposta>');
  });
  
  lines.push('  </Apostas>');
  lines.push('</ExportacaoApostas>');
  
  return lines.join('\n');
}

// Download file helper
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Log export for audit trail
async function logExport(
  userId: string,
  workspaceId: string,
  format: ExportFormat,
  context: ExportContext
): Promise<void> {
  try {
    // Use 'CREATE' action type with entity_type='export' for audit trail
    await supabase.from('audit_logs').insert({
      actor_user_id: userId,
      workspace_id: workspaceId,
      action: 'CREATE' as const,
      entity_type: 'export',
      entity_name: `${context.abaOrigem} (${format.toUpperCase()})`,
      metadata: {
        export_format: format,
        aba_origem: context.abaOrigem,
        filtros_aplicados: context.filtrosAplicados,
        total_registros: context.totalRegistros,
      },
    });
  } catch (error) {
    // Non-blocking - just log error
    console.error('Failed to log export audit:', error);
  }
}

/**
 * Hook for exporting bets to CSV/XML
 * 
 * Features:
 * - Permission-based access control
 * - Workspace isolation
 * - Audit logging
 * - Excel/Sheets compatible output
 */
export function useExportApostas(): UseExportApostasReturn {
  const [exporting, setExporting] = useState(false);
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();
  
  // Check if user can view bets (required for export)
  const { allowed: canViewApostas, loading: permissionLoading } = usePermission('view_apostas');
  
  // Can export if user has view permission (or permission check allows)
  const canExport = !permissionLoading && canViewApostas !== false;
  
  const exportToCSV = useCallback(async (
    records: ExportApostaRecord[],
    filename: string,
    context: ExportContext
  ) => {
    if (!canExport || !user?.id || !workspaceId) {
      toast.error('Sem permissão para exportar');
      return;
    }
    
    if (records.length === 0) {
      toast.error('Nenhum registro para exportar');
      return;
    }
    
    setExporting(true);
    try {
      const csv = generateCSV(records);
      const finalFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
      
      downloadFile(csv, finalFilename, 'text/csv;charset=utf-8');
      
      // Audit log
      await logExport(user.id, workspaceId, 'csv', context);
      
      toast.success(`${records.length} registros exportados para CSV`);
    } catch (error) {
      console.error('Export CSV error:', error);
      toast.error('Erro ao exportar CSV');
    } finally {
      setExporting(false);
    }
  }, [canExport, user?.id, workspaceId]);
  
  const exportToXML = useCallback(async (
    records: ExportApostaRecord[],
    filename: string,
    context: ExportContext
  ) => {
    if (!canExport || !user?.id || !workspaceId) {
      toast.error('Sem permissão para exportar');
      return;
    }
    
    if (records.length === 0) {
      toast.error('Nenhum registro para exportar');
      return;
    }
    
    setExporting(true);
    try {
      const xml = generateXML(records, context);
      const finalFilename = filename.endsWith('.xml') ? filename : `${filename}.xml`;
      
      downloadFile(xml, finalFilename, 'application/xml;charset=utf-8');
      
      // Audit log
      await logExport(user.id, workspaceId, 'xml', context);
      
      toast.success(`${records.length} registros exportados para XML`);
    } catch (error) {
      console.error('Export XML error:', error);
      toast.error('Erro ao exportar XML');
    } finally {
      setExporting(false);
    }
  }, [canExport, user?.id, workspaceId]);
  
  return {
    exportToCSV,
    exportToXML,
    exporting,
    canExport,
  };
}
