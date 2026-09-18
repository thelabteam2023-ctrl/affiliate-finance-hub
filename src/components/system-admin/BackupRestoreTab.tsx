import { useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, Download, HardDriveDownload, Upload, FileArchive, CheckCircle2, Loader2 } from 'lucide-react';
import { useSystemBackup, type PacoteLido } from '@/hooks/useSystemBackup';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), u.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export function BackupRestoreTab() {
  const {
    etapa, progresso, detalhe, resumo, backupResumo,
    gerarBackup, lerPacote, restaurar, reset,
  } = useSystemBackup();

  const [incluirLogs, setIncluirLogs] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [pacote, setPacote] = useState<PacoteLido | null>(null);
  const [lendo, setLendo] = useState(false);
  const [confirmacao, setConfirmacao] = useState('');
  const [restaurando, setRestaurando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleBackup = async () => {
    setGerando(true);
    await gerarBackup(incluirLogs);
    setGerando(false);
  };

  const handleArquivo = async (file?: File) => {
    if (!file) return;
    setLendo(true);
    setPacote(null);
    setConfirmacao('');
    try {
      const lido = await lerPacote(file);
      setPacote(lido);
    } catch (e: any) {
      alert(e?.message ?? 'Não foi possível ler o pacote.');
    } finally {
      setLendo(false);
    }
  };

  const handleRestaurar = async () => {
    if (!pacote) return;
    setRestaurando(true);
    try {
      await restaurar(pacote);
    } catch {
      /* erro já exibido */
    } finally {
      setRestaurando(false);
      setConfirmacao('');
    }
  };

  const etapaLabel = etapa === 'dados' ? 'Dados' : etapa === 'fotos' ? 'Fotos e arquivos' : etapa === 'finalizando' ? 'Finalizando' : etapa === 'concluido' ? 'Concluído' : etapa === 'erro' ? 'Erro' : '';

  return (
    <div className="space-y-4">
      {/* ---------- BACKUP ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDriveDownload className="h-5 w-5" />
            Gerar backup completo
          </CardTitle>
          <CardDescription>
            Gera um único pacote com todos os dados, todas as fotos e arquivos, a estrutura do banco e um resumo do conteúdo.
            O download começa automaticamente ao final.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox id="incluir-logs" checked={incluirLogs} onCheckedChange={(v) => setIncluirLogs(Boolean(v))} />
            <Label htmlFor="incluir-logs" className="text-sm font-normal">
              Incluir registros de histórico e diagnóstico (pacote maior)
            </Label>
          </div>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Pode demorar</AlertTitle>
            <AlertDescription>
              Em bases grandes a geração leva alguns minutos. Mantenha esta aba aberta até o download começar.
              Se o pacote ficar muito pesado, gere sem os registros de histórico.
            </AlertDescription>
          </Alert>

          <Button onClick={handleBackup} disabled={gerando || restaurando} className="gap-2">
            {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {gerando ? 'Gerando backup...' : 'Gerar backup completo'}
          </Button>

          {gerando && (
            <div className="space-y-2">
              <Progress value={progresso} />
              <p className="text-sm text-muted-foreground">{etapaLabel}: {detalhe}</p>
            </div>
          )}

          {backupResumo && !gerando && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Backup concluído</AlertTitle>
              <AlertDescription>
                {backupResumo.arquivo} — {formatBytes(backupResumo.tamanho)}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ---------- RESTAURAÇÃO ---------- */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Restaurar de um arquivo
          </CardTitle>
          <CardDescription>
            Envie um pacote gerado por esta tela. O sistema fica idêntico ao pacote: tudo que não estiver nele será removido.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Operação destrutiva</AlertTitle>
            <AlertDescription>
              A restauração apaga os registros e arquivos atuais que não existem no pacote. Gere um backup do estado atual antes de continuar
              e prefira executar com o sistema fora de uso. Senhas e sessões de login não são restauradas.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="pacote">Pacote de backup (.zip)</Label>
            <Input
              id="pacote"
              ref={inputRef}
              type="file"
              accept=".zip"
              disabled={lendo || restaurando}
              onChange={(e) => handleArquivo(e.target.files?.[0])}
            />
          </div>

          {lendo && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Lendo o pacote...
            </p>
          )}

          {pacote && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <FileArchive className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Pacote de {format(new Date(pacote.manifest.gerado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                  {!pacote.temSchema && <Badge variant="outline">sem estrutura</Badge>}
                  {!pacote.manifest.inclui_logs && <Badge variant="outline">sem histórico</Badge>}
                </div>
                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-4">
                  <div>{pacote.manifest.totais.tabelas} tabelas</div>
                  <div>{pacote.manifest.totais.linhas.toLocaleString('pt-BR')} linhas</div>
                  <div>{pacote.manifest.totais.arquivos} arquivos</div>
                  <div>{pacote.manifest.usuarios} usuários</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmar">Para liberar, digite <strong>RESTAURAR</strong></Label>
                <Input
                  id="confirmar"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value.toUpperCase())}
                  placeholder="RESTAURAR"
                  disabled={restaurando}
                />
              </div>

              <Button
                variant="destructive"
                className="gap-2"
                disabled={confirmacao !== 'RESTAURAR' || restaurando || gerando}
                onClick={handleRestaurar}
              >
                {restaurando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {restaurando ? 'Restaurando...' : 'Restaurar sobrescrevendo tudo'}
              </Button>

              {restaurando && (
                <div className="space-y-2">
                  <Progress value={progresso} />
                  <p className="text-sm text-muted-foreground">{etapaLabel}: {detalhe}</p>
                </div>
              )}
            </>
          )}

          {resumo && !restaurando && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Restauração concluída</AlertTitle>
              <AlertDescription className="space-y-1">
                <div>
                  {resumo.tabelas} tabelas, {resumo.linhas.toLocaleString('pt-BR')} linhas e {resumo.arquivos} arquivos restaurados.
                </div>
                {resumo.usuariosAusentes.length > 0 && (
                  <div>
                    {resumo.usuariosAusentes.length} usuário(s) do pacote não têm conta de acesso hoje e precisam ser recriados manualmente:{' '}
                    {resumo.usuariosAusentes.slice(0, 5).map((u) => u.email ?? u.id).join(', ')}
                    {resumo.usuariosAusentes.length > 5 ? '...' : ''}
                  </div>
                )}
                {resumo.erros.length > 0 && (
                  <div className="text-destructive">
                    {resumo.erros.length} ocorrência(s) com erro. Primeiras: {resumo.erros.slice(0, 3).map((e) => `${e.contexto}: ${e.erro}`).join(' | ')}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {(resumo || backupResumo) && !restaurando && !gerando && (
            <Button variant="ghost" size="sm" onClick={() => { reset(); setPacote(null); setConfirmacao(''); if (inputRef.current) inputRef.current.value = ''; }}>
              Limpar
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
