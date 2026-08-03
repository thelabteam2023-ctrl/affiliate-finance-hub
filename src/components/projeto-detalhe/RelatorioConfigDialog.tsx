import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  FileText, 
  Download, 
  Calendar, 
  BarChart3,
  TrendingUp,
  Target,
  FileSpreadsheet,
  FileCode,
  Loader2,
  Users,
  Briefcase,
  Layers,
  Zap,
  Layout,
  Eye,
  Coins
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRange } from "react-day-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { StandardPeriodFilter, getDateRangeFromPeriod } from "./StandardTimeFilter";
import { useAuth } from "@/hooks/useAuth";
import { exportRelatorioExecutivo } from "@/lib/relatorios/exportRelatorioExecutivo";
import { useProjetoResultado } from "@/hooks/useProjetoResultado";
import { useKpiBreakdowns } from "@/hooks/useKpiBreakdowns";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { useCotacoes } from "@/hooks/useCotacoes";
import { toast } from "sonner";
import { useProjetoHistoricoContas } from "@/hooks/useProjetoHistoricoContas";
import { ScrollArea } from "@/components/ui/scroll-area";
import logoAsset from "@/assets/HORIZONTAL_OFICIAL_2-2.png.asset.json";

interface RelatorioConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
}

type RelatorioModelo = 'executivo' | 'financeiro' | 'operacional' | 'investidores';
type FormatoExportacao = 'pdf' | 'xlsx' | 'csv' | 'xml';

interface SecaoConfig {
  id: string;
  label: string;
  enabled: boolean;
  icon: any;
}

export function RelatorioConfigDialog({
  open,
  onOpenChange,
  projetoId,
}: RelatorioConfigDialogProps) {
  const { workspace } = useAuth();
  const [modelo, setModelo] = useState<RelatorioModelo>('executivo');
  const [formato, setFormato] = useState<FormatoExportacao>('pdf');
  const [period, setPeriod] = useState<StandardPeriodFilter>("mes_atual");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
  const [generating, setGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [secoes, setSecoes] = useState<SecaoConfig[]>([
    { id: 'resumo', label: 'Resumo Financeiro', enabled: true, icon: TrendingUp },
    { id: 'operacional', label: 'Indicadores Operacionais', enabled: true, icon: Zap },
    { id: 'modulos', label: 'Performance por Módulo', enabled: true, icon: Layers },
    { id: 'bonusPerformance', label: 'Performance de Bônus', enabled: true, icon: Coins },
    { id: 'vinculos', label: 'Contribuição por Vínculo', enabled: true, icon: Users },
    { id: 'investidores', label: 'Performance por Investidor (CPF)', enabled: false, icon: Users },
    { id: 'casas', label: 'Performance por Casa', enabled: false, icon: Briefcase },
    { id: 'insights', label: 'Insights e Recomendações', enabled: true, icon: Target },
    { id: 'evolucao', label: 'Visão Temporal (Gráficos)', enabled: true, icon: BarChart3 },
  ]);

  const { 
    convertToConsolidation, 
    convertToConsolidationOficial, 
    moedaConsolidacao, 
    cotacaoOficialUSD,
    formatCurrency,
    projeto
  } = useProjetoCurrency(projetoId);

  const dateRange = getDateRangeFromPeriod(period, customDateRange);

  const { resultado } = useProjetoResultado({
    projetoId,
    dataInicio: dateRange?.start,
    dataFim: dateRange?.end,
    convertToConsolidation,
    cotacaoKey: cotacaoOficialUSD,
  });

  const { breakdowns } = useKpiBreakdowns({
    projetoId,
    dataInicio: dateRange?.start,
    dataFim: dateRange?.end,
    moedaConsolidacao,
    convertToConsolidation,
    convertToConsolidationOficial,
    cotacaoKey: cotacaoOficialUSD,
  });

  const historicoContas = useProjetoHistoricoContas(projetoId);

  const handleGenerate = async () => {
    if (!projeto || !workspace || !resultado) {
      toast.error("Dados do projeto não carregados");
      return;
    }

    setGenerating(true);
    try {
      if (formato === 'pdf') {
        await exportRelatorioExecutivo({
          projeto: {
            id: projetoId,
            nome: projeto.nome,
            tipo_projeto: projeto.tipo_projeto,
            status: projeto.status,
            moeda_consolidacao: moedaConsolidacao,
          },
          workspace: { nome: (workspace as any)?.name || (workspace as any)?.nome || "Workspace" },
          periodo: { de: dateRange?.start || null, ate: dateRange?.end || null },
          resultado,
          breakdowns,
          historicoContas,
          formatCurrency,
          config: {
            secoes: secoes.reduce((acc, s) => ({ ...acc, [s.id]: s.enabled }), {}),
          }
        });
        toast.success("Relatório gerado com sucesso!");
        onOpenChange(false);
      } else {
        toast.info("Exportação para este formato será implementada em breve.");
      }
    } catch (error: any) {
      console.error("Erro ao gerar relatório:", error);
      toast.error("Erro ao gerar relatório: " + error.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`sm:max-w-[${showPreview ? '900px' : '480px'}] transition-all duration-300 max-h-[90vh] overflow-hidden flex flex-col`}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Configurar Relatório do Projeto
          </DialogTitle>
          <DialogDescription>
            Defina os parâmetros para a geração do relatório consolidado.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-6 overflow-hidden flex-grow px-1">
          <ScrollArea className={`${showPreview ? 'w-[300px]' : 'w-full'} flex-shrink-0 pr-4 h-full`}>
            <div className="grid gap-6 py-4">
              {/* Período */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Período de Análise
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={period} onValueChange={(v: StandardPeriodFilter) => setPeriod(v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione o período" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hoje">Hoje</SelectItem>
                      <SelectItem value="ontem">Ontem</SelectItem>
                      <SelectItem value="7dias">Últimos 7 dias</SelectItem>
                      <SelectItem value="30dias">Últimos 30 dias</SelectItem>
                      <SelectItem value="mes_atual">Mês Atual</SelectItem>
                      <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
                      <SelectItem value="trimestre">Trimestre</SelectItem>
                      <SelectItem value="ano">Este Ano</SelectItem>
                      <SelectItem value="total">Todo o Período</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                  {period === "custom" && (
                    <div className="flex items-center gap-2 w-full">
                      <DatePicker 
                        value={customDateRange?.from ? format(customDateRange.from, 'yyyy-MM-dd') : ''}
                        onChange={(d) => {
                          const date = d ? new Date(d + 'T12:00:00') : undefined;
                          setCustomDateRange(prev => ({ from: date, to: prev?.to }));
                        }}
                        placeholder="Início"
                      />
                      <DatePicker 
                        value={customDateRange?.to ? format(customDateRange.to, 'yyyy-MM-dd') : ''}
                        onChange={(d) => {
                          const date = d ? new Date(d + 'T12:00:00') : undefined;
                          setCustomDateRange(prev => ({ from: prev?.from, to: date }));
                        }}
                        placeholder="Fim"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Modelo */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  Modelo do Relatório
                </Label>
                <div className="grid grid-cols-1 gap-2">
                  <div 
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${modelo === 'executivo' ? 'bg-primary/5 border-primary' : 'hover:bg-accent'}`}
                    onClick={() => setModelo('executivo')}
                  >
                    <TrendingUp className={`h-5 w-5 mt-0.5 ${modelo === 'executivo' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div>
                      <div className="text-sm font-medium">Relatório Executivo</div>
                      <div className="text-xs text-muted-foreground">Resumo financeiro, ROI e performance global.</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Seleção de Seções */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Layout className="h-4 w-4 text-muted-foreground" />
                  Conteúdo do Relatório
                </Label>
                <div className="grid grid-cols-1 gap-2 border rounded-lg p-3 bg-accent/5">
                  {secoes.map((secao) => (
                    <div key={secao.id} className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0 border-b last:border-0 border-accent/20">
                      <div className="flex items-center gap-2">
                        <secao.icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{secao.label}</span>
                      </div>
                      <Checkbox 
                        checked={secao.enabled} 
                        onCheckedChange={(checked) => {
                          setSecoes(prev => prev.map(s => s.id === secao.id ? { ...s, enabled: !!checked } : s));
                        }} 
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Formato */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Download className="h-4 w-4 text-muted-foreground" />
                  Formato de Exportação
                </Label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'pdf', label: 'PDF', icon: FileText, color: 'text-red-500' },
                    { id: 'xlsx', label: 'Excel', icon: FileSpreadsheet, color: 'text-emerald-600' },
                    { id: 'csv', label: 'CSV', icon: FileSpreadsheet, color: 'text-emerald-500' },
                    { id: 'xml', label: 'XML', icon: FileCode, color: 'text-blue-500' }
                  ].map((f) => (
                    <div 
                      key={f.id}
                      className={`flex flex-col items-center justify-center p-2 rounded-lg border cursor-pointer transition-colors ${formato === f.id ? 'bg-primary/5 border-primary' : 'hover:bg-accent'}`}
                      onClick={() => setFormato(f.id as FormatoExportacao)}
                    >
                      <f.icon className={`h-5 w-5 mb-1 ${f.color}`} />
                      <span className="text-[10px] font-medium">{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>

          {showPreview && (
            <div className="flex-grow border rounded-lg bg-accent/5 overflow-hidden flex flex-col p-4 min-w-0">
              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4 text-primary" />
                  Pré-visualização do PDF
                </h3>
              </div>
              <ScrollArea className="flex-grow bg-[#0A0B0F] border shadow-inner">
                <div className="p-8 text-[#F2F3F6] min-h-full font-sans bg-[#0A0B0F] selection:bg-primary/30">
                  {/* Header Preview - Design Dark SaaS Premium */}
                  <div className="flex flex-col gap-3 border-b border-[#23262F] pb-5 mb-7">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <img src={logoAsset.url} alt="Logo" className="h-[22px]" />
                        <span className="text-[14px] font-bold tracking-[1px] uppercase">LABBET</span>
                      </div>
                      <div className="text-[10px] text-[#6C7280] text-right leading-tight">
                        {format(new Date(), "dd 'de' MMMM 'de' yyyy, HH:mm", { locale: ptBR })}<br/>
                        <span className="opacity-70">DOC-ID: {projetoId.slice(0, 8).toUpperCase()}</span>
                      </div>
                    </div>
                    
                    <div className="mt-1">
                      <h1 className="text-[26px] font-bold tracking-[-0.3px] leading-tight">Relatório de Performance</h1>
                      <div className="text-[11px] text-[#8990A3] mt-1 font-medium">Análise executiva de resultados operacionais e eficiência financeira</div>
                    </div>
                  </div>

                  {/* Identification Meta Bar - Regra 4.2: label acima → valor abaixo */}
                  <div className="bg-[#12141A] border border-[#1F222C] rounded-[10px] mb-7 flex items-stretch">
                    <div className="flex-1 p-4 border-r border-[#1F222C]">
                      <div className="text-[9px] text-[#6C7280] uppercase tracking-[0.8px] font-bold mb-1">Projeto</div>
                      <div className="font-bold text-[13px] truncate">{projeto?.nome}</div>
                    </div>
                    <div className="flex-1 p-4 border-r border-[#1F222C]">
                      <div className="text-[9px] text-[#6C7280] uppercase tracking-[0.8px] font-bold mb-1">Período</div>
                      <div className="font-bold text-[13px]">
                        {dateRange?.start && dateRange?.end 
                          ? `${format(dateRange.start, "dd/MM/yy")} a ${format(dateRange.end, "dd/MM/yy")}`
                          : "Todo o período"}
                      </div>
                    </div>
                    <div className="flex-1 p-4">
                      <div className="text-[9px] text-[#6C7280] uppercase tracking-[0.8px] font-bold mb-1">Status</div>
                      <div className="flex items-center">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-[#34D399]/14 text-[#34D399] text-[9px] font-bold uppercase tracking-[0.3px]">
                          {projeto?.status || 'ATIVO'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Active Sections Preview */}
                  <div className="space-y-7">
                    {secoes.filter(s => s.enabled).map(secao => (
                      <div key={secao.id}>
                        <h2 className="text-[12px] font-bold uppercase tracking-[1px] text-[#6C7280] mb-3">{secao.label}</h2>
                        
                        {secao.id === 'resumo' ? (
                          <div className="grid grid-cols-3 gap-3 mb-4">
                            {[
                              { label: 'Lucro Realizado', val: resultado?.netProfit || 0, sub: 'Resultado líquido', color: (resultado?.netProfit || 0) >= 0 ? '#34D399' : '#F87171' },
                              { label: 'ROI Operacional', val: `${(resultado?.roi || 0).toFixed(1)}%`, sub: 'Eficiência capital', color: '#3C63FF' },
                              { label: 'Total Depositado', val: resultado?.totalDepositos || 0, sub: 'Aporte bruto', color: '#F2F3F6' },
                            ].map((kpi, idx) => (
                              <div key={idx} className="bg-[#12141A] border border-[#1F222C] rounded-[10px] p-4 border-l-[3px]" style={{ borderLeftColor: kpi.color }}>
                                <div className="text-[9.5px] font-bold uppercase tracking-[0.8px] text-[#6C7280] mb-2">{kpi.label}</div>
                                <div className="text-[18px] font-bold font-mono" style={{ color: kpi.color }}>
                                  {typeof kpi.val === 'number' ? formatCurrency(kpi.val) : kpi.val}
                                </div>
                                <div className="text-[9px] text-[#8990A3] mt-1">{kpi.sub}</div>
                              </div>
                            ))}
                          </div>
                        ) : secao.id === 'vinculos' ? (
                          <div className="bg-[#12141A] border border-[#1F222C] rounded-[10px] overflow-hidden">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-[#171A22] border-b border-[#1F222C]">
                                  <th className="p-3 text-[9.5px] font-bold uppercase text-[#6C7280]">Vínculo</th>
                                  <th className="p-3 text-[9.5px] font-bold uppercase text-[#6C7280] text-center">Casas</th>
                                  <th className="p-3 text-[9.5px] font-bold uppercase text-[#6C7280] text-right">Bônus</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(historicoContas?.historicoParceirosLista || []).slice(0, 3).map((p, i) => (
                                  <tr key={i} className="border-b border-[#1B1E27] last:border-0">
                                    <td className="p-3 text-[11px] font-medium">{p.nome}</td>
                                    <td className="p-3 text-[11px] text-center">{p.totalContas}</td>
                                    <td className="p-3 text-[11px] font-bold text-right font-mono">{formatCurrency(p.totalBonus || 0)}</td>
                                  </tr>
                                ))}
                                {(!historicoContas?.historicoParceirosLista || historicoContas.historicoParceirosLista.length === 0) && (
                                  <tr>
                                    <td colSpan={3} className="p-4 text-[11px] text-[#4B5061] text-center italic">
                                      Nenhuma contribuição identificada.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        ) : secao.id === 'modulos' ? (
                          <div className="bg-[#12141A] border border-[#1F222C] rounded-[10px] p-4 space-y-3">
                            {(breakdowns?.lucro?.contributions || []).slice(0, 3).map((c, i) => (
                              <div key={i}>
                                <div className="flex justify-between text-[11px] mb-1.5 font-medium">
                                  <span>{c.moduleName}</span>
                                  <span className="font-bold font-mono" style={{ color: c.value >= 0 ? '#34D399' : '#F87171' }}>
                                    {c.value >= 0 ? '+' : ''}{formatCurrency(c.value)}
                                  </span>
                                </div>
                                <div className="h-1.5 bg-[#171A22] rounded-full overflow-hidden">
                                  <div 
                                    className="h-full rounded-full" 
                                    style={{ 
                                      width: '70%', 
                                      backgroundColor: c.value >= 0 ? '#34D399' : '#F87171' 
                                    }} 
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="bg-[#12141A] border border-[#1F222C] rounded-[10px] p-4 text-[11px] text-[#8990A3] text-center italic">
                            Conteúdo da seção em prévia simplificada...
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 bg-accent/5 p-4 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowPreview(!showPreview)}
              className="gap-2"
            >
              {showPreview ? "Ocultar Prévia" : "Ver Prévia"}
              <Eye className="h-4 w-4" />
            </Button>
            <Button onClick={handleGenerate} disabled={generating} className="gap-2">
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Gerar Relatório
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
