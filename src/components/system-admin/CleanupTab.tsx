import { useEffect, useState } from 'react';
import { useCleanupSystem } from '@/hooks/useCleanupSystem';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Trash2, AlertTriangle, RefreshCw, TestTube, Play, 
  CheckCircle2, XCircle, Eye, Shield
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function CleanupTab() {
  const {
    loading,
    candidates,
    dryRunResult,
    cleanupResult,
    fetchCandidates,
    setTestUser,
    runDryRun,
    executeCleanup,
    clearResults,
  } = useCleanupSystem();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDryRunDialog, setShowDryRunDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmationPhrase, setConfirmationPhrase] = useState('');

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(candidates.map(c => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(x => x !== id));
    }
  };

  const handleDryRun = async () => {
    const result = await runDryRun(selectedIds);
    if (result) {
      setShowDryRunDialog(true);
    }
  };

  const handleProceedToCleanup = () => {
    // Só permite prosseguir se dry-run foi validado
    if (!dryRunResult?.validated) {
      return;
    }
    setShowDryRunDialog(false);
    setShowConfirmDialog(true);
    setConfirmationPhrase('');
  };

  const handleExecuteCleanup = async () => {
    const result = await executeCleanup(selectedIds, confirmationPhrase);
    if (result) {
      setShowConfirmDialog(false);
      setSelectedIds([]);
      setConfirmationPhrase('');
    }
  };

  const testUsers = candidates.filter(c => c.is_test_user);
  const regularUsers = candidates.filter(c => !c.is_test_user);

  return (
    <div className="space-y-6">
      {/* Info Card */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertTitle>Sistema de Limpeza Controlada</AlertTitle>
        <AlertDescription>
          Esta ferramenta remove contas de teste e todos os dados vinculados a elas. 
          A operação é <strong>irreversível</strong>. Sempre execute o "Dry-Run" antes para verificar o impacto.
        </AlertDescription>
      </Alert>

      {/* Cleanup Result */}
      {cleanupResult && (
        <Alert className="border-emerald-500/50 bg-emerald-500/10">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <AlertTitle className="text-emerald-500">Limpeza Concluída</AlertTitle>
          <AlertDescription>
            <p>Total de registros afetados: <strong>{cleanupResult.total_records_affected}</strong></p>
            <p>Workspaces removidos: <strong>{cleanupResult.workspace_ids_removed?.length || 0}</strong></p>
            <Button variant="link" size="sm" className="p-0 h-auto" onClick={clearResults}>
              Fechar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Main Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Limpeza de Contas de Teste
              </CardTitle>
              <CardDescription>
                Selecione os usuários que deseja remover. O System Owner nunca aparece nesta lista.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchCandidates} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Actions Bar */}
          <div className="flex items-center justify-between mb-4 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {selectedIds.length} de {candidates.length} selecionados
              </span>
              {selectedIds.length > 0 && (
                <Badge variant="secondary">{testUsers.filter(u => selectedIds.includes(u.id)).length} marcados como teste</Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDryRun}
                disabled={loading || selectedIds.length === 0}
              >
                <Eye className="h-4 w-4 mr-2" />
                Dry-Run (Simular)
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedIds.length === candidates.length && candidates.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Cadastro</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((c) => (
                  <TableRow key={c.id} className={c.is_test_user ? 'bg-amber-500/5' : ''}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(c.id)}
                        onCheckedChange={(checked) => handleSelectOne(c.id, checked as boolean)}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{c.full_name || 'Sem nome'}</div>
                        <div className="text-sm text-muted-foreground">{c.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {c.workspace_name || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(c.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      {c.is_test_user ? (
                        <Badge className="bg-amber-500/20 text-amber-400 gap-1">
                          <TestTube className="h-3 w-3" /> Teste
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Normal</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTestUser(c.id, !c.is_test_user)}
                      >
                        {c.is_test_user ? (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <TestTube className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {candidates.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum candidato à limpeza encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dry Run Dialog */}
      <Dialog open={showDryRunDialog} onOpenChange={setShowDryRunDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Resultado da Simulação (Dry-Run)
            </DialogTitle>
            <DialogDescription>
              Esta é uma prévia do que será removido. Nenhuma alteração foi feita ainda.
            </DialogDescription>
          </DialogHeader>

          {dryRunResult && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold">{dryRunResult.summary.users_to_remove}</div>
                    <p className="text-sm text-muted-foreground">Usuários a remover</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold">{dryRunResult.summary.workspaces_to_remove}</div>
                    <p className="text-sm text-muted-foreground">Workspaces a remover</p>
                  </CardContent>
                </Card>
              </div>

              {/* Record Counts */}
              <div>
                <h4 className="font-medium mb-2">Registros por tabela:</h4>
                <ScrollArea className="h-64 rounded-md border p-4">
                  <div className="space-y-2">
                    {Object.entries(dryRunResult.record_counts)
                      .filter(([_, count]) => count > 0)
                      .sort((a, b) => b[1] - a[1])
                      .map(([table, count]) => (
                        <div key={table} className="flex justify-between items-center py-1 border-b last:border-0">
                          <span className="text-sm">{table}</span>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      ))}
                    {Object.values(dryRunResult.record_counts).every(c => c === 0) && (
                      <p className="text-muted-foreground text-sm">Nenhum registro será afetado</p>
                    )}
                  </div>
                </ScrollArea>
              </div>

              <Alert variant={dryRunResult.validated ? "destructive" : "default"} className={!dryRunResult.validated ? "border-amber-500/50 bg-amber-500/10" : ""}>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{dryRunResult.validated ? "Atenção" : "Validação OK"}</AlertTitle>
                <AlertDescription>
                  {dryRunResult.validated 
                    ? "Esta operação é irreversível. Os dados serão permanentemente removidos."
                    : "Todas as queries foram validadas. A limpeza pode prosseguir com segurança."
                  }
                </AlertDescription>
              </Alert>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDryRunDialog(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleProceedToCleanup}
              disabled={!dryRunResult?.validated}
            >
              <Play className="h-4 w-4 mr-2" />
              Prosseguir para Limpeza
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Cleanup Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirmação Final
            </DialogTitle>
            <DialogDescription>
              Para executar a limpeza, digite a frase exata abaixo:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-3 bg-muted rounded-lg text-center font-mono">
              CONFIRMAR LIMPEZA DEFINITIVA
            </div>
            <div className="space-y-2">
              <Label>Digite a frase de confirmação:</Label>
              <Input
                value={confirmationPhrase}
                onChange={(e) => setConfirmationPhrase(e.target.value)}
                placeholder="Digite aqui..."
                className="font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleExecuteCleanup}
              disabled={confirmationPhrase !== 'CONFIRMAR LIMPEZA DEFINITIVA' || loading}
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Executando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Executar Limpeza
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
