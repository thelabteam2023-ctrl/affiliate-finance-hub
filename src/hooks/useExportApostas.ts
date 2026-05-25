import { useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useWorkspace } from "./useWorkspace";
import { usePermission } from "./usePermission";
import * as XLSX from 'xlsx';
import type { 
  ExportApostaRecord, 
  ExportFormat, 
  ExportContext, 
  UseExportApostasReturn,
  CSV_HEADERS 
} from "@/types/exportApostas";

// Column order for export
const EXPORT_COLUMNS: (keyof ExportApostaRecord)[] = [
  'data_hora',
  'esporte',
  'mercado',
  'evento',
  'bookmaker',
  'tipo_aposta',
  'odd',
  'fair_value',
  'stake',
  'stake_unidades',
  'resultado',
  'lucro_unidades',
  'lucro_prejuizo',
  'roi',
  'id',
  'estrategia',
  'aba_origem',
  'selecao',
  'status',
  'observacoes'
];

// CSV Headers mapping
const HEADERS: Record<keyof ExportApostaRecord, string> = {
  id: 'ID',
  data_hora: 'Data/Hora',
  projeto_nome: 'Projeto',
  bookmaker: 'Fonte (Casa)',
  esporte: 'Esporte',
  mercado: 'Mercado',
  evento: 'Evento',
  estrategia: 'Estratégia',
  tipo_aposta: 'Tipo de Aposta',
  aba_origem: 'Aba Origem',
  selecao: 'Seleção',
  odd: 'Cotação',
  fair_value: 'Cotação Fair Value',
  stake: 'Stake (R$)',
  stake_unidades: 'Stake (Unidades)',
  retorno: 'Retorno',
  resultado: 'Resultado',
  status: 'Status',
  lucro_prejuizo: 'Lucro/Prejuízo (R$)',
  lucro_unidades: 'Lucro/Prejuízo (Unidades)',
  roi: 'ROI Individual',
  observacoes: 'Observações',
};

// Escape CSV value (handles commas, quotes, newlines)
function escapeCSV(value: string | number | undefined | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r') || str.includes(';')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Format value for display (numbers with proper formatting)
function formatValue(key: keyof ExportApostaRecord, value: unknown): string {
  if (value === null || value === undefined) return '';
  
  if (['odd', 'fair_value', 'stake', 'stake_unidades', 'retorno', 'lucro_prejuizo', 'lucro_unidades', 'roi'].includes(key)) {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    return num.toFixed(2).replace('.', ',');
  }
  
  return String(value);
}

// Generate CSV content from records
function generateCSV(records: ExportApostaRecord[]): string {
  if (records.length === 0) return '';
  
  // Header row
  const header = EXPORT_COLUMNS.map(col => escapeCSV(HEADERS[col])).join(';');
  
  // Data rows
  const rows = records.map(record => 
    EXPORT_COLUMNS.map(col => escapeCSV(formatValue(col, record[col]))).join(';')
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
    EXPORT_COLUMNS.forEach(col => {
      const tag = col.charAt(0).toUpperCase() + col.slice(1);
      lines.push(`      <${tag}>${xmlEscape(record[col])}</${tag}>`);
    });
    lines.push('    </Aposta>');
  });
  
  lines.push('  </Apostas>');
  lines.push('</ExportacaoApostas>');
  
  return lines.join('\n');
}

// Download file helper
function downloadFile(content: string | Blob, filename: string, mimeType: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
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
    console.error('Failed to log export audit:', error);
  }
}

export function useExportApostas(): UseExportApostasReturn {
  const [exporting, setExporting] = useState(false);
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();
  const { allowed: canViewApostas, loading: permissionLoading } = usePermission('view_apostas');
  
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
      await logExport(user.id, workspaceId, 'xml', context);
      toast.success(`${records.length} registros exportados para XML`);
    } catch (error) {
      console.error('Export XML error:', error);
      toast.error('Erro ao exportar XML');
    } finally {
      setExporting(false);
    }
  }, [canExport, user?.id, workspaceId]);

  const exportToExcel = useCallback(async (
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
      const data = records.map(record => {
        const row: any = {};
        EXPORT_COLUMNS.forEach(col => {
          row[HEADERS[col]] = record[col];
        });
        return row;
      });

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Apostas");
      
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const excelBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      const finalFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
      downloadFile(excelBlob, finalFilename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      
      await logExport(user.id, workspaceId, 'xlsx', context);
      toast.success(`${records.length} registros exportados para Excel`);
    } catch (error) {
      console.error('Export Excel error:', error);
      toast.error('Erro ao exportar Excel');
    } finally {
      setExporting(false);
    }
  }, [canExport, user?.id, workspaceId]);
  
  return {
    exportToCSV,
    exportToXML,
    exportToExcel,
    exporting,
    canExport,
  };
}