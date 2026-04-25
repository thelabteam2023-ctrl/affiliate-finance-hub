import type { RpcCallLog } from "@/lib/dev/rpcInterceptor";

type RpcImpact = "consulta" | "escrita" | "financeiro" | "seguranca";

interface RpcDefinition {
  name: string;
  description: string;
  impact: RpcImpact;
}

export interface RpcExplanation extends RpcDefinition {
  impactLabel: string;
  statusLabel: string;
  statusMeaning: string;
  durationLabel: string;
  argsSummary: string;
  resultSummary: string;
  errorMeaning: string | null;
  isCritical: boolean;
}

const RPC_DEFINITIONS: Record<string, RpcDefinition> = {
  get_user_workspaces: {
    name: "Buscar workspaces do usuário",
    description: "Lista os ambientes aos quais o usuário tem acesso.",
    impact: "seguranca",
  },
  get_effective_access: {
    name: "Conferir acesso efetivo",
    description: "Confirma permissões reais do usuário dentro do workspace atual.",
    impact: "seguranca",
  },
  get_user_role: {
    name: "Identificar perfil do usuário",
    description: "Verifica se o usuário é owner, admin, operador ou outro perfil.",
    impact: "seguranca",
  },
  get_cached_exchange_rates: {
    name: "Buscar cotações em cache",
    description: "Carrega as últimas cotações salvas para conversões de moeda.",
    impact: "consulta",
  },
  get_bookmaker_saldos: {
    name: "Buscar saldos das casas",
    description: "Consulta saldo real, freebet, bônus, saldo em aposta e saldo disponível das bookmakers do projeto.",
    impact: "financeiro",
  },
  get_bookmakers_pendentes_conciliacao: {
    name: "Verificar casas pendentes de conciliação",
    description: "Procura bookmakers com possível diferença entre saldo informado e saldo calculado.",
    impact: "financeiro",
  },
  get_my_pending_invites: {
    name: "Buscar convites pendentes",
    description: "Consulta convites de workspace ainda não aceitos pelo usuário.",
    impact: "seguranca",
  },
  criar_aposta_atomica_v3: {
    name: "Criar aposta com proteção financeira",
    description: "Registra a aposta e suas pernas em uma única operação segura, evitando gravação parcial.",
    impact: "financeiro",
  },
  criar_aposta_atomica: {
    name: "Criar aposta com proteção financeira",
    description: "Registra uma aposta de forma atômica, validando dados antes de confirmar.",
    impact: "financeiro",
  },
  liquidar_aposta_v4: {
    name: "Liquidar aposta",
    description: "Finaliza o resultado da aposta e aplica o impacto financeiro correspondente.",
    impact: "financeiro",
  },
  reverter_liquidacao_v4: {
    name: "Reverter liquidação",
    description: "Desfaz uma liquidação anterior para corrigir resultado ou saldo.",
    impact: "financeiro",
  },
  deletar_aposta_v4: {
    name: "Excluir aposta com segurança",
    description: "Remove uma aposta usando o fluxo protegido que restaura efeitos financeiros quando necessário.",
    impact: "financeiro",
  },
  desvincular_bookmaker_atomico: {
    name: "Desvincular casa do projeto",
    description: "Remove o vínculo da bookmaker com o projeto preservando consistência financeira.",
    impact: "financeiro",
  },
  get_projeto_dashboard_data: {
    name: "Carregar dados do dashboard",
    description: "Busca indicadores consolidados para a visão geral do projeto.",
    impact: "consulta",
  },
  get_projeto_apostas_resumo: {
    name: "Resumir apostas do projeto",
    description: "Consulta totais e agrupamentos usados nos indicadores de apostas.",
    impact: "consulta",
  },
};

const KEY_LABELS: Record<string, string> = {
  _user_id: "usuário",
  user_id: "usuário",
  _workspace_id: "workspace",
  workspace_id: "workspace",
  p_workspace_id: "workspace",
  p_projeto_id: "projeto",
  projeto_id: "projeto",
  project_id: "projeto",
  bookmaker_id: "casa/bookmaker",
  p_bookmaker_id: "casa/bookmaker",
  aposta_id: "aposta",
  p_aposta_id: "aposta",
  valor: "valor financeiro",
  amount: "valor financeiro",
  moeda: "moeda",
  currency: "moeda",
  p_aposta_data: "dados da aposta",
  p_pernas_data: "pernas da aposta",
};

function impactLabel(impact: RpcImpact) {
  if (impact === "financeiro") return "Financeiro crítico";
  if (impact === "seguranca") return "Segurança/acesso";
  if (impact === "escrita") return "Escrita";
  return "Consulta";
}

function inferDefinition(fnName: string): RpcDefinition {
  const lower = fnName.toLowerCase();
  const financial = ["saldo", "bookmaker", "aposta", "ledger", "liquid", "saque", "wallet", "debit", "stake", "freebet"];
  const security = ["user", "role", "permission", "workspace", "invite", "access", "session", "login"];
  const writes = ["create", "criar", "update", "editar", "delete", "deletar", "excluir", "cancel", "confirm", "commit", "revert", "reverter", "accept", "change"];

  const impact: RpcImpact = financial.some((term) => lower.includes(term))
    ? "financeiro"
    : security.some((term) => lower.includes(term))
      ? "seguranca"
      : writes.some((term) => lower.startsWith(term) || lower.includes(`_${term}_`))
        ? "escrita"
        : "consulta";

  return {
    name: "Operação interna do sistema",
    description: "Função técnica chamada pelo app para buscar, validar ou atualizar informações.",
    impact,
  };
}

function statusMeaning(status: RpcCallLog["status"]) {
  if (status === "success") return ["Executou com sucesso", "A função respondeu sem erro."] as const;
  if (status === "pending") return ["Aguardando resposta", "A função ainda está processando ou esperando retorno."] as const;
  return ["Falhou", "A ação pode não ter sido concluída; verifique a mensagem de erro."] as const;
}

function durationLabel(ms: number | null) {
  if (ms == null) return "medindo...";
  if (ms < 300) return "rápida";
  if (ms < 1000) return "normal";
  if (ms < 2500) return "lenta";
  return "muito lenta";
}

function formatValue(value: unknown): string {
  if (value == null) return "sem valor";
  if (typeof value === "string") {
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)) return `${value.slice(0, 8)}…${value.slice(-4)}`;
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} item(ns)`;
  if (typeof value === "object") return "objeto com dados internos";
  return String(value);
}

function summarizeArgs(args: unknown) {
  if (args == null) return "Nenhum dado enviado para a função.";
  if (typeof args !== "object") return `Valor enviado: ${formatValue(args)}.`;
  const entries = Object.entries(args as Record<string, unknown>);
  if (entries.length === 0) return "Nenhum dado enviado para a função.";
  return entries
    .slice(0, 6)
    .map(([key, value]) => `${KEY_LABELS[key] ?? key}: ${formatValue(value)}`)
    .join(" · ");
}

function summarizeResult(resultPreview: string | null) {
  if (!resultPreview) return "Sem amostra de retorno capturada.";
  try {
    const parsed = JSON.parse(resultPreview);
    if (Array.isArray(parsed)) return parsed.length === 0 ? "Retornou uma lista vazia." : `Retornou uma lista com ${parsed.length} item(ns).`;
    if (parsed && typeof parsed === "object") return `Retornou dados com campos: ${Object.keys(parsed).slice(0, 5).join(", ")}.`;
    return `Retornou: ${formatValue(parsed)}.`;
  } catch {
    return resultPreview.length > 120 ? `${resultPreview.slice(0, 120)}...` : resultPreview;
  }
}

function explainError(error: string | null) {
  if (!error) return null;
  const lower = error.toLowerCase();
  if (lower.includes("permission") || lower.includes("permiss")) return "Erro de permissão: o usuário pode não ter acesso para executar esta ação.";
  if (lower.includes("saldo") || lower.includes("insufficient")) return "Erro financeiro: pode haver saldo insuficiente ou inconsistência de saldo.";
  if (lower.includes("not found") || lower.includes("não encontrado")) return "Registro não encontrado: algum ID enviado não localizou dados correspondentes.";
  if (lower.includes("duplicate") || lower.includes("unique")) return "Duplicidade: o sistema tentou gravar algo que já existe.";
  return "Erro técnico retornado pela função; use a mensagem original para auditoria.";
}

export function explainRpcCall(log: RpcCallLog): RpcExplanation {
  const definition = RPC_DEFINITIONS[log.fn_name] ?? inferDefinition(log.fn_name);
  const [statusLabel, statusText] = statusMeaning(log.status);
  return {
    ...definition,
    impactLabel: impactLabel(definition.impact),
    statusLabel,
    statusMeaning: statusText,
    durationLabel: durationLabel(log.duration_ms),
    argsSummary: summarizeArgs(log.args),
    resultSummary: summarizeResult(log.result_preview),
    errorMeaning: explainError(log.error),
    isCritical: definition.impact === "financeiro" || log.status === "error",
  };
}