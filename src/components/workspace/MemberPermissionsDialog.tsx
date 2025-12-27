import { useState, useMemo } from "react";
import { usePermissionOverrides } from "@/hooks/usePermissionOverrides";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Loader2, Info, Shield, Trash2, Users, DollarSign, Building, FolderOpen, TrendingUp, Lock, AlertCircle, CheckSquare, HelpCircle } from "lucide-react";

// Explicações detalhadas para cada permissão
const permissionExplanations: Record<string, { title: string; explanation: string; example: string }> = {
  // Bookmakers
  "bookmakers.catalog.read": {
    title: "Ver catálogo de casas",
    explanation: "Permite visualizar a lista de todas as casas de apostas disponíveis no catálogo do sistema.",
    example: "O usuário pode consultar quais casas existem, seus status e informações gerais."
  },
  "bookmakers.catalog.create": {
    title: "Adicionar casas ao catálogo",
    explanation: "Permite cadastrar novas casas de apostas no catálogo do sistema.",
    example: "Criar uma nova casa como 'Bet365' com suas configurações de bônus."
  },
  "bookmakers.catalog.edit": {
    title: "Editar casas do catálogo",
    explanation: "Permite alterar informações de casas já cadastradas no catálogo.",
    example: "Atualizar o status operacional de uma casa ou suas regras de bônus."
  },
  "bookmakers.catalog.delete": {
    title: "Remover casas do catálogo",
    explanation: "Permite excluir casas de apostas do catálogo do sistema.",
    example: "Remover uma casa que não opera mais no mercado."
  },
  "bookmakers.accounts.read": {
    title: "Ver contas em casas",
    explanation: "Permite visualizar as contas abertas em casas de apostas vinculadas aos parceiros.",
    example: "Consultar saldo, login e status das contas em cada casa."
  },
  "bookmakers.accounts.create": {
    title: "Criar contas em casas",
    explanation: "Permite vincular novas contas de casas de apostas a parceiros.",
    example: "Registrar uma nova conta da Bet365 para o parceiro João."
  },
  "bookmakers.accounts.edit": {
    title: "Editar contas em casas",
    explanation: "Permite alterar dados das contas em casas de apostas.",
    example: "Atualizar o saldo ou alterar credenciais de acesso de uma conta."
  },
  "bookmakers.accounts.delete": {
    title: "Remover contas de casas",
    explanation: "Permite excluir contas de casas de apostas do sistema.",
    example: "Remover uma conta que foi encerrada ou limitada."
  },
  // Caixa
  "caixa.ledger.read": {
    title: "Ver movimentações do caixa",
    explanation: "Permite visualizar todas as transações financeiras registradas no caixa.",
    example: "Consultar depósitos, saques e transferências realizados."
  },
  "caixa.ledger.create": {
    title: "Registrar movimentações",
    explanation: "Permite criar novas transações no caixa, como depósitos e saques.",
    example: "Registrar um depósito de R$ 1.000 vindo de um investidor."
  },
  "caixa.ledger.edit": {
    title: "Editar movimentações",
    explanation: "Permite alterar transações já registradas no caixa.",
    example: "Corrigir o valor de uma transação digitada incorretamente."
  },
  "caixa.ledger.delete": {
    title: "Excluir movimentações",
    explanation: "Permite remover transações do caixa.",
    example: "Deletar uma transação duplicada ou incorreta."
  },
  "caixa.saldos.read": {
    title: "Ver saldos",
    explanation: "Permite visualizar os saldos consolidados de parceiros e contas.",
    example: "Consultar quanto cada parceiro possui em suas contas bancárias."
  },
  // Captação
  "captacao.indicadores.read": {
    title: "Ver indicadores",
    explanation: "Permite visualizar a lista de indicadores cadastrados.",
    example: "Consultar quem são os indicadores e seus dados de contato."
  },
  "captacao.indicadores.create": {
    title: "Criar indicadores",
    explanation: "Permite cadastrar novos indicadores no sistema.",
    example: "Adicionar um novo indicador que trouxe parceiros para a operação."
  },
  "captacao.indicadores.edit": {
    title: "Editar indicadores",
    explanation: "Permite alterar dados de indicadores existentes.",
    example: "Atualizar o percentual de comissão de um indicador."
  },
  "captacao.indicadores.delete": {
    title: "Excluir indicadores",
    explanation: "Permite remover indicadores do sistema.",
    example: "Deletar um indicador que não atua mais."
  },
  "captacao.parcerias.read": {
    title: "Ver parcerias",
    explanation: "Permite visualizar as parcerias com afiliados e outros parceiros.",
    example: "Consultar acordos comerciais e links de afiliação."
  },
  "captacao.parcerias.create": {
    title: "Criar parcerias",
    explanation: "Permite cadastrar novas parcerias no sistema.",
    example: "Registrar um novo acordo de afiliação com uma casa."
  },
  "captacao.parcerias.edit": {
    title: "Editar parcerias",
    explanation: "Permite alterar dados de parcerias existentes.",
    example: "Atualizar os termos ou comissões de uma parceria."
  },
  "captacao.parcerias.delete": {
    title: "Excluir parcerias",
    explanation: "Permite remover parcerias do sistema.",
    example: "Deletar uma parceria encerrada."
  },
  "captacao.fornecedores.read": {
    title: "Ver fornecedores",
    explanation: "Permite visualizar a lista de fornecedores cadastrados.",
    example: "Consultar fornecedores de contas e seus dados."
  },
  "captacao.fornecedores.create": {
    title: "Criar fornecedores",
    explanation: "Permite cadastrar novos fornecedores no sistema.",
    example: "Adicionar um novo fornecedor de documentos."
  },
  "captacao.fornecedores.edit": {
    title: "Editar fornecedores",
    explanation: "Permite alterar dados de fornecedores existentes.",
    example: "Atualizar dados de contato de um fornecedor."
  },
  "captacao.fornecedores.delete": {
    title: "Excluir fornecedores",
    explanation: "Permite remover fornecedores do sistema.",
    example: "Deletar um fornecedor inativo."
  },
  // Financeiro
  "financeiro.kpis.read": {
    title: "Ver KPIs financeiros",
    explanation: "Permite visualizar os indicadores de performance financeira.",
    example: "Consultar ROI, burn rate e outras métricas."
  },
  "financeiro.despesas.read": {
    title: "Ver despesas",
    explanation: "Permite visualizar as despesas administrativas.",
    example: "Consultar gastos com ferramentas, taxas e outros custos."
  },
  "financeiro.despesas.create": {
    title: "Registrar despesas",
    explanation: "Permite criar novas despesas administrativas.",
    example: "Registrar o pagamento de uma assinatura de software."
  },
  "financeiro.despesas.edit": {
    title: "Editar despesas",
    explanation: "Permite alterar despesas já registradas.",
    example: "Corrigir o valor ou categoria de uma despesa."
  },
  "financeiro.despesas.delete": {
    title: "Excluir despesas",
    explanation: "Permite remover despesas do sistema.",
    example: "Deletar uma despesa duplicada."
  },
  "financeiro.participacoes.read": {
    title: "Ver participações",
    explanation: "Permite visualizar as participações de investidores e sócios.",
    example: "Consultar quanto cada sócio tem direito nos lucros."
  },
  "financeiro.participacoes.edit": {
    title: "Editar participações",
    explanation: "Permite alterar as participações cadastradas.",
    example: "Atualizar o percentual de um investidor."
  },
  // Investidores
  "investidores.read": {
    title: "Ver investidores",
    explanation: "Permite visualizar a lista de investidores e seus dados.",
    example: "Consultar quem são os investidores e seus aportes."
  },
  "investidores.create": {
    title: "Criar investidores",
    explanation: "Permite cadastrar novos investidores no sistema.",
    example: "Adicionar um novo investidor que aportou capital."
  },
  "investidores.edit": {
    title: "Editar investidores",
    explanation: "Permite alterar dados de investidores existentes.",
    example: "Atualizar os dados de contato de um investidor."
  },
  "investidores.delete": {
    title: "Excluir investidores",
    explanation: "Permite remover investidores do sistema.",
    example: "Deletar um investidor que saiu da operação."
  },
  // Operadores
  "operadores.read": {
    title: "Ver operadores",
    explanation: "Permite visualizar a lista de operadores e seus dados.",
    example: "Consultar quem são os operadores e em quais projetos atuam."
  },
  "operadores.create": {
    title: "Criar operadores",
    explanation: "Permite cadastrar novos operadores no sistema.",
    example: "Adicionar um novo operador para executar apostas."
  },
  "operadores.edit": {
    title: "Editar operadores",
    explanation: "Permite alterar dados de operadores existentes.",
    example: "Atualizar o acordo de participação de um operador."
  },
  "operadores.delete": {
    title: "Excluir operadores",
    explanation: "Permite remover operadores do sistema.",
    example: "Deletar um operador que não atua mais."
  },
  "operadores.pagamentos.read": {
    title: "Ver pagamentos a operadores",
    explanation: "Permite visualizar o histórico de pagamentos aos operadores.",
    example: "Consultar quanto já foi pago a cada operador."
  },
  "operadores.pagamentos.create": {
    title: "Registrar pagamentos",
    explanation: "Permite criar novos pagamentos para operadores.",
    example: "Registrar o pagamento mensal de um operador."
  },
  // Parceiros
  "parceiros.read": {
    title: "Ver parceiros",
    explanation: "Permite visualizar a lista de parceiros (CPFs/contas).",
    example: "Consultar todos os parceiros cadastrados e seus dados."
  },
  "parceiros.create": {
    title: "Criar parceiros",
    explanation: "Permite cadastrar novos parceiros no sistema.",
    example: "Adicionar um novo parceiro com seus dados bancários."
  },
  "parceiros.edit": {
    title: "Editar parceiros",
    explanation: "Permite alterar dados de parceiros existentes.",
    example: "Atualizar as contas bancárias de um parceiro."
  },
  "parceiros.delete": {
    title: "Excluir parceiros",
    explanation: "Permite remover parceiros do sistema.",
    example: "Deletar um parceiro que não atua mais."
  },
  // Projetos
  "projetos.read": {
    title: "Ver projetos",
    explanation: "Permite visualizar a lista de projetos e seus dados.",
    example: "Consultar todos os projetos ativos e seus resultados."
  },
  "projetos.create": {
    title: "Criar projetos",
    explanation: "Permite cadastrar novos projetos no sistema.",
    example: "Criar um novo projeto para uma operação de bônus."
  },
  "projetos.edit": {
    title: "Editar projetos",
    explanation: "Permite alterar dados de projetos existentes.",
    example: "Atualizar as configurações ou status de um projeto."
  },
  "projetos.delete": {
    title: "Excluir projetos",
    explanation: "Permite remover projetos do sistema.",
    example: "Deletar um projeto finalizado ou cancelado."
  },
  "projetos.apostas.read": {
    title: "Ver apostas",
    explanation: "Permite visualizar as apostas registradas nos projetos.",
    example: "Consultar o histórico de apostas e seus resultados."
  },
  "projetos.apostas.create": {
    title: "Registrar apostas",
    explanation: "Permite criar novas apostas nos projetos.",
    example: "Registrar uma aposta realizada em uma casa."
  },
  "projetos.apostas.edit": {
    title: "Editar apostas",
    explanation: "Permite alterar apostas já registradas.",
    example: "Corrigir o resultado ou valores de uma aposta."
  },
  "projetos.apostas.delete": {
    title: "Excluir apostas",
    explanation: "Permite remover apostas do sistema.",
    example: "Deletar uma aposta cancelada ou duplicada."
  },
  "projetos.ciclos.read": {
    title: "Ver ciclos",
    explanation: "Permite visualizar os ciclos operacionais dos projetos.",
    example: "Consultar o progresso e resultados de cada ciclo."
  },
  "projetos.ciclos.create": {
    title: "Criar ciclos",
    explanation: "Permite iniciar novos ciclos em projetos.",
    example: "Abrir um novo ciclo para um projeto de bônus."
  },
  "projetos.ciclos.edit": {
    title: "Editar ciclos",
    explanation: "Permite alterar dados de ciclos existentes.",
    example: "Ajustar as datas ou metas de um ciclo."
  },
};

interface MemberPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: {
    id: string;
    user_id: string;
    email?: string;
    full_name?: string;
    role: string;
  };
  onPermissionsChanged?: () => void;
}

const moduleConfig: Record<string, { label: string; icon: any; description: string }> = {
  parceiros: { 
    label: "Parceiros", 
    icon: Users,
    description: "Gerenciamento de parceiros e contas bancárias"
  },
  projetos: { 
    label: "Projetos", 
    icon: FolderOpen,
    description: "Projetos, apostas e ciclos operacionais"
  },
  caixa: { 
    label: "Caixa", 
    icon: DollarSign,
    description: "Transações financeiras e saldos"
  },
  bookmakers: { 
    label: "Casas (Bookmakers)", 
    icon: Building,
    description: "Catálogo e contas em bookmakers"
  },
  captacao: { 
    label: "Captação", 
    icon: TrendingUp,
    description: "Indicadores, parcerias e fornecedores"
  },
  financeiro: { 
    label: "Financeiro", 
    icon: DollarSign,
    description: "KPIs financeiros, despesas e participações"
  },
  investidores: {
    label: "Investidores",
    icon: Users,
    description: "Gestão de investidores e aportes"
  },
  operadores: {
    label: "Operadores",
    icon: Users,
    description: "Gestão de operadores e pagamentos"
  },
};

const actionLabels: Record<string, string> = {
  create: "Criar",
  read: "Ver",
  edit: "Editar",
  delete: "Deletar",
  execute: "Executar",
};

const planLabels: Record<string, string> = {
  free: "Gratuito",
  starter: "Starter",
  pro: "Pro",
  advanced: "Advanced",
  enterprise: "Enterprise",
};

export function MemberPermissionsDialog({
  open,
  onOpenChange,
  member,
  onPermissionsChanged,
}: MemberPermissionsDialogProps) {
  const { toast } = useToast();
  const {
    permissionsByModule,
    loading,
    hasOverride,
    toggleOverride,
    clearAllOverrides,
    overrideCount,
    canUseCustomPermissions,
    hasLimitedPermissions,
    maxOverrides,
    workspacePlan,
    toggleModulePermissions,
    isModuleFullyEnabled,
    isModulePartiallyEnabled,
  } = usePermissionOverrides(member.user_id, member.role);

  const [saving, setSaving] = useState<string | null>(null);
  const [savingModule, setSavingModule] = useState<string | null>(null);

  const handleToggle = async (permissionCode: string, currentState: boolean) => {
    setSaving(permissionCode);
    try {
      await toggleOverride(permissionCode, !currentState);
      onPermissionsChanged?.();
    } catch (error: any) {
      if (error.message === 'PLAN_NOT_ALLOWED') {
        toast({
          title: "Plano não permite",
          description: "Seu plano atual não permite permissões customizadas. Faça upgrade para Pro ou superior.",
          variant: "destructive",
        });
      } else if (error.message === 'LIMIT_REACHED') {
        toast({
          title: "Limite atingido",
          description: `Seu plano permite no máximo ${maxOverrides} permissões customizadas.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro",
          description: "Não foi possível alterar a permissão.",
          variant: "destructive",
        });
      }
    } finally {
      setSaving(null);
    }
  };

  const handleClearAll = async () => {
    try {
      await clearAllOverrides();
      onPermissionsChanged?.();
      toast({
        title: "Permissões removidas",
        description: "Todas as permissões adicionais foram removidas.",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível remover as permissões.",
        variant: "destructive",
      });
    }
  };

  const handleToggleModule = async (module: string, grant: boolean) => {
    setSavingModule(module);
    try {
      await toggleModulePermissions(module, grant);
      onPermissionsChanged?.();
    } catch (error: any) {
      if (error.message === 'PLAN_NOT_ALLOWED') {
        toast({
          title: "Plano não permite",
          description: "Seu plano atual não permite permissões customizadas.",
          variant: "destructive",
        });
      } else if (error.message === 'LIMIT_REACHED') {
        toast({
          title: "Limite atingido",
          description: `Ativar todas ultrapassaria o limite de ${maxOverrides} permissões.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro",
          description: "Não foi possível alterar as permissões.",
          variant: "destructive",
        });
      }
    } finally {
      setSavingModule(null);
    }
  };

  // Viewer can never have extra permissions
  if (member.role === 'viewer') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Permissões Adicionais
            </DialogTitle>
          </DialogHeader>
          <div className="text-center py-8 text-muted-foreground">
            <Info className="h-10 w-10 mx-auto mb-4 opacity-50" />
            <p>Visualizadores não podem receber permissões adicionais.</p>
            <p className="text-sm mt-2">Altere a função base para conceder mais acesso.</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Plan doesn't allow custom permissions
  if (!canUseCustomPermissions) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Permissões Adicionais
            </DialogTitle>
          </DialogHeader>
          <div className="py-6">
            <Alert variant="default" className="border-amber-500/50 bg-amber-500/10">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-700 dark:text-amber-400">
                <p className="font-medium mb-2">
                  Plano {planLabels[workspacePlan] || workspacePlan} não suporta permissões customizadas
                </p>
                <p className="text-sm">
                  Para habilitar permissões adicionais por membro, faça upgrade para o plano Pro ou superior.
                </p>
              </AlertDescription>
            </Alert>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              <p>Permissões customizadas permitem que operadores executem tarefas administrativas ou financeiras sem alterar a função base.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Permissões Adicionais
          </DialogTitle>
          <DialogDescription>
            Configure permissões extras para{" "}
            <span className="font-medium text-foreground">
              {member.full_name || member.email}
            </span>
            . Essas permissões são adicionais à função base ({member.role}).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Header with count, limit info, and clear button */}
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                {overrideCount > 0 && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary">
                    {overrideCount} permissão(ões) ativa(s)
                  </Badge>
                )}
                {hasLimitedPermissions && (
                  <Badge variant="outline" className="text-muted-foreground">
                    Limite: {overrideCount}/{maxOverrides}
                  </Badge>
                )}
              </div>
              {overrideCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAll}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Limpar todas
                </Button>
              )}
            </div>

            {/* Limit warning */}
            {hasLimitedPermissions && overrideCount >= maxOverrides && (
              <Alert variant="default" className="border-amber-500/50 bg-amber-500/10 mb-4">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700 dark:text-amber-400 text-sm">
                  Limite de {maxOverrides} permissões atingido. Remova uma permissão para adicionar outra, ou faça upgrade para o plano Advanced.
                </AlertDescription>
              </Alert>
            )}

            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-6">
                {Object.entries(permissionsByModule).map(([module, perms]) => {
                  const config = moduleConfig[module] || { 
                    label: module.charAt(0).toUpperCase() + module.slice(1), 
                    icon: Shield,
                    description: ""
                  };
                  const ModuleIcon = config.icon;

                  return (
                    <div key={module} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ModuleIcon className="h-4 w-4 text-muted-foreground" />
                          <h3 className="font-medium text-sm">{config.label}</h3>
                          {config.description && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Info className="h-3 w-3 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs">{config.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleModule(module, !isModuleFullyEnabled(module))}
                          disabled={savingModule === module || (hasLimitedPermissions && overrideCount >= maxOverrides && !isModulePartiallyEnabled(module))}
                          className="h-7 px-2 text-xs"
                        >
                          {savingModule === module ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <CheckSquare className="h-3 w-3 mr-1" />
                          )}
                          {isModuleFullyEnabled(module) ? "Desmarcar todos" : "Marcar todos"}
                        </Button>
                      </div>

                      <div className="grid gap-2 pl-6">
                        {perms.map((perm) => {
                          const isEnabled = hasOverride(perm.code);
                          const isSaving = saving === perm.code;
                          const actionLabel = actionLabels[perm.action] || perm.action;
                          const isAtLimit = hasLimitedPermissions && overrideCount >= maxOverrides && !isEnabled;
                          const explanation = permissionExplanations[perm.code];

                          return (
                            <div
                              key={perm.code}
                              className={`flex items-center justify-between py-2 px-3 rounded-md hover:bg-accent/50 transition-colors ${isAtLimit ? 'opacity-50' : ''}`}
                            >
                              <div className="flex items-center gap-2">
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium">
                                    {actionLabel}: {perm.description}
                                  </span>
                                  <span className="text-xs text-muted-foreground font-mono">
                                    {perm.code}
                                  </span>
                                </div>
                                {explanation && (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        className="h-5 w-5 rounded-full bg-muted hover:bg-muted-foreground/20 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                                      >
                                        <HelpCircle className="h-3.5 w-3.5" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80" side="left" align="start">
                                      <div className="space-y-2">
                                        <h4 className="font-semibold text-sm">{explanation.title}</h4>
                                        <p className="text-sm text-muted-foreground">
                                          {explanation.explanation}
                                        </p>
                                        <div className="pt-2 border-t">
                                          <p className="text-xs text-muted-foreground">
                                            <span className="font-medium">Exemplo:</span> {explanation.example}
                                          </p>
                                        </div>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {isSaving && (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                )}
                                <Switch
                                  checked={isEnabled}
                                  onCheckedChange={() => handleToggle(perm.code, isEnabled)}
                                  disabled={isSaving || isAtLimit}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <Separator className="mt-4" />
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="text-xs text-muted-foreground pt-2 border-t">
              <Info className="h-3 w-3 inline mr-1" />
              Permissões adicionais expandem os poderes da função base, mas não concedem acesso fora do workspace.
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
