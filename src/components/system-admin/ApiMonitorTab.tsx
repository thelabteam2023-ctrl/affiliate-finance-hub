import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  RefreshCw, 
  Play, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Database, 
  Globe,
  ArrowRight
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ApiUsage {
  api_name: string;
  total_calls: number;
  total_credits: number;
  total_errors: number;
}

interface SummaryData {
  today: ApiUsage[];
  month: ApiUsage[];
  lastCall: {
    api_name: string;
    created_at: string;
    status_code: number;
    duration_ms: number;
  } | null;
  limits: {
    [key: string]: { daily: number | null; monthly: number | null };
  };
}

interface LogEntry {
  id: string;
  api_name: string;
  endpoint: string;
  sport_key: string | null;
  status_code: number;
  credits_used: number;
  records_returned: number;
  duration_ms: number;
  error_message: string | null;
  triggered_by: string;
  created_at: string;
}

export function ApiMonitorTab() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [previewApi, setPreviewApi] = useState('odds_api');
  const [previewSport, setPreviewSport] = useState('soccer_epl');
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [jobRunning, setJobRunning] = useState<string | null>(null);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('api-monitor', {
        method: 'GET',
        headers: { 'path': 'summary' } // Middleware uses pathname, but let's check how invoke handles it
      });
      
      // Since invoke might not support custom paths easily if the function isn't structured for it, 
      // we might need to use a query param or handle it in the function based on body/method.
      // My function uses the last segment of url.pathname.
      // Supabase invoke usually calls the root. I'll adjust the call.
      
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`https://kxfkmritrhpkgmwlxcft.supabase.co/functions/v1/api-monitor/summary`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });
      const summaryData = await res.json();
      // Guarda contra respostas de erro: garante a forma esperada
      setSummary({
        today: Array.isArray(summaryData?.today) ? summaryData.today : [],
        month: Array.isArray(summaryData?.month) ? summaryData.month : [],
        lastCall: summaryData?.lastCall ?? null,
        limits: summaryData?.limits ?? {},
      });
    } catch (err) {
      console.error('Error fetching summary:', err);
      toast.error('Erro ao carregar resumo de uso das APIs');
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`https://kxfkmritrhpkgmwlxcft.supabase.co/functions/v1/api-monitor/logs?limit=20`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    fetchLogs();
  }, []);

  const handlePreview = async () => {
    setPreviewLoading(true);
    setPreviewResult(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`https://kxfkmritrhpkgmwlxcft.supabase.co/functions/v1/api-monitor/preview?api=${previewApi}&sport=${previewSport}`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });
      const data = await res.json();
      setPreviewResult(data);
      fetchSummary(); // Refresh stats after call
      fetchLogs();
    } catch (err) {
      toast.error('Erro ao buscar prévia da API');
    } finally {
      setPreviewLoading(false);
    }
  };

  const runJob = async (jobKey: string) => {
    setJobRunning(jobKey);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`https://kxfkmritrhpkgmwlxcft.supabase.co/functions/v1/api-monitor/run-job`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ job: jobKey })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Job ${jobKey} concluído com sucesso`);
      } else {
        toast.error(`Erro no job: ${data.error}`);
      }
      fetchSummary();
      fetchLogs();
    } catch (err) {
      toast.error('Erro ao disparar job');
    } finally {
      setJobRunning(null);
    }
  };

  const getUsageForApi = (apiName: string, type: 'today' | 'month') => {
    if (!summary) return { total_calls: 0, total_credits: 0, total_errors: 0 };
    const list = (type === 'today' ? summary.today : summary.month) || [];
    return list.find((u: ApiUsage) => u.api_name === apiName) || { total_calls: 0, total_credits: 0, total_errors: 0 };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-primary/5 border border-primary/10 p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/20 rounded-lg">
            <Globe className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold">Explorador de Dados</h3>
            <p className="text-xs text-muted-foreground">Visualize jogos e ligas em tempo real da API</p>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => window.location.href = '/admin/api-explorer'}
          className="gap-2"
        >
          Acessar Explorador
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* BLOCO 1 — Cards de consumo */}
      <div className="grid gap-4 md:grid-cols-2">
        {['odds_api', 'api_football'].map(api => {
          const today = getUsageForApi(api, 'today');
          const month = getUsageForApi(api, 'month');
          const limits = summary?.limits[api];
          const apiLabel = api === 'odds_api' ? 'The Odds API' : 'API-Football';
          
          return (
            <Card key={api}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-lg">{apiLabel}</CardTitle>
                  <CardDescription>Consumo de créditos</CardDescription>
                </div>
                <Activity className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Chamadas (Hoje)</div>
                    <div className="text-lg font-bold">{today.total_calls}</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Créditos (Hoje)</div>
                    <div className="text-lg font-bold">{today.total_credits}</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Erros (Hoje)</div>
                    <div className="text-lg font-bold text-destructive">{today.total_errors}</div>
                  </div>
                </div>

                {limits?.daily && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Limite Diário</span>
                      <span>{today.total_credits} / {limits.daily}</span>
                    </div>
                    <Progress value={(today.total_credits / (limits.daily || 1)) * 100} className="h-1.5" />
                  </div>
                )}

                <div className="pt-2">
                   <div className="text-sm font-medium mb-1">Total Mensal</div>
                   <div className="flex items-end gap-2">
                     <div className="text-2xl font-black">{month.total_credits}</div>
                     {limits?.monthly && (
                       <div className="text-xs text-muted-foreground mb-1">/ {limits.monthly} créditos</div>
                     )}
                   </div>
                   {limits?.monthly && (
                     <Progress 
                        value={(month.total_credits / (limits.monthly || 1)) * 100} 
                        className={`h-2 mt-2 ${
                          (month.total_credits / limits.monthly) > 0.9 ? 'bg-destructive/20' : 
                          (month.total_credits / limits.monthly) > 0.8 ? 'bg-amber-500/20' : ''
                        }`}
                        // Progress component handles color via tailwind usually, but we can't easily change the indicator color here without a custom class
                     />
                   )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* BLOCO 2 & 3 — Teste e Jobs */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* BLOCO 2 — Prévia de dados */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" /> Prévia de Dados
            </CardTitle>
            <CardDescription>Testar chamadas sem salvar registros</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Select value={previewApi} onValueChange={setPreviewApi}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Selecione a API" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="odds_api">The Odds API</SelectItem>
                  <SelectItem value="api_football">API-Football</SelectItem>
                </SelectContent>
              </Select>

              <Select value={previewSport} onValueChange={setPreviewSport}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Esporte/Liga" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="soccer_epl">Premier League</SelectItem>
                  <SelectItem value="soccer_brazil_campeonato">Brasileirão</SelectItem>
                  <SelectItem value="basketball_nba">NBA</SelectItem>
                  <SelectItem value="tennis_atp">ATP Tennis</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              className="w-full" 
              onClick={handlePreview} 
              disabled={previewLoading}
            >
              {previewLoading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Visualizar dados (1 crédito)
            </Button>

            {previewResult && (
              <div className="mt-4 p-3 rounded-lg bg-black/40 font-mono text-[10px] space-y-2 max-h-[300px] overflow-auto border">
                <div className="flex justify-between border-b border-white/10 pb-1 mb-2">
                  <span className="text-emerald-400">Status: {previewResult.statusCode}</span>
                  <span className="text-blue-400">Tempo: {previewResult.durationMs}ms</span>
                  <span className="text-amber-400">Registros: {previewResult.recordsReturned}</span>
                </div>
                <div className="text-muted-foreground break-all mb-2">{previewResult.url}</div>
                <pre className="text-white">
                  {JSON.stringify(
                    Array.isArray(previewResult.rawData) ? previewResult.rawData.slice(0, 2) : 
                    previewResult.rawData?.response ? { ...previewResult.rawData, response: previewResult.rawData.response.slice(0, 2) } :
                    previewResult.rawData, 
                    null, 2
                  )}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        {/* BLOCO 3 — Disparar jobs manualmente */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4" /> Sincronização Manual
            </CardTitle>
            <CardDescription>Executar rotinas de atualização</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { key: 'fetch_events', label: 'Buscar jogos do dia', cost: '8 cr' },
              { key: 'fetch_scores', label: 'Buscar resultados', cost: '4 cr' },
              { key: 'fetch_sports_directory', label: 'Atualizar esportes', cost: '1 cr' },
            ].map(job => (
              <div key={job.key} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{job.label}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{job.cost}</span>
                </div>
                <Button 
                  size="sm" 
                  variant="outline"
                  disabled={!!jobRunning}
                  onClick={() => runJob(job.key)}
                >
                  {jobRunning === job.key ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                  <span className="ml-2">Executar</span>
                </Button>
              </div>
            ))}
            <div className="mt-4 p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
               <div className="flex gap-2">
                 <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                 <p className="text-[11px] text-amber-200/80 leading-relaxed">
                   Atenção: A execução manual consome créditos da API exatamente como a execução automática via CRON. 
                   Utilize apenas para testes ou correções de urgência.
                 </p>
               </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* BLOCO 4 — Log de requisições */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Histórico de Requisições</CardTitle>
            <CardDescription>Últimas 20 chamadas processadas</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchLogs} disabled={logsLoading}>
            <RefreshCw className={`h-4 w-4 ${logsLoading ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-xs">Data/Hora</TableHead>
                  <TableHead className="text-xs">API</TableHead>
                  <TableHead className="text-xs">Endpoint / Liga</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">CR</TableHead>
                  <TableHead className="text-xs">Reg</TableHead>
                  <TableHead className="text-xs">Tempo</TableHead>
                  <TableHead className="text-xs">Gatilho</TableHead>
                  <TableHead className="text-xs text-right">Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id} className={log.error_message ? "bg-destructive/5" : ""}>
                    <TableCell className="text-[10px] text-muted-foreground">
                      {format(new Date(log.created_at), 'dd/MM HH:mm:ss', { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[9px] uppercase px-1">
                        {log.api_name === 'odds_api' ? 'Odds' : 'Foot'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[10px] font-mono max-w-[150px] truncate">
                      {log.sport_key || log.endpoint}
                    </TableCell>
                    <TableCell>
                       <span className={`text-[10px] font-bold ${log.status_code >= 400 ? 'text-destructive' : 'text-emerald-400'}`}>
                         {log.status_code || 'ERR'}
                       </span>
                    </TableCell>
                    <TableCell className="text-[10px] font-medium">{log.credits_used}</TableCell>
                    <TableCell className="text-[10px]">{log.records_returned}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{log.duration_ms}ms</TableCell>
                    <TableCell className="text-[10px]">
                      {log.triggered_by === 'cron' ? (
                        <Clock className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <div className="h-3 w-3 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {log.error_message ? (
                        <div className="flex items-center justify-end gap-1 text-[9px] text-destructive font-medium">
                          <XCircle className="h-3 w-3" /> ERRO
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1 text-[9px] text-emerald-400 font-medium">
                          <CheckCircle2 className="h-3 w-3" /> OK
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && !logsLoading && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-xs italic">
                      Nenhum registro encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
