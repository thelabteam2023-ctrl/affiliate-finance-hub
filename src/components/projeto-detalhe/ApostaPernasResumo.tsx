import { Badge } from "@/components/ui/badge";

export interface Perna {
  bookmaker_id?: string;
  bookmaker_nome?: string;
  bookmaker?: string;
  selecao: string;
  selecao_livre?: string; // Linha real da aposta (ex: Over 2.5, Handicap -1.5)
  odd: number;
  stake?: number;
  resultado?: string | null;
  operador?: string | null;
  operador_nome?: string | null;
}

interface ApostaPernasResumoProps {
  pernas: Perna[];
  variant?: "card" | "list" | "compact";
  showStake?: boolean;
  showResultado?: boolean;
  className?: string;
}

/**
 * Retorna o label de exibição para a seleção.
 * PRIORIDADE: selecao_livre (linha real) > selecao original
 * 
 * Se selecao_livre existir, usa ela (ex: "Over 2.5", "Handicap -1.5")
 * Se não, usa o fallback do mercado (1/X/2) apenas para valores genéricos
 */
function getSelecaoLabel(perna: Perna): string {
  // Se tem selecao_livre, usar ela diretamente (é a linha real da aposta)
  if (perna.selecao_livre && perna.selecao_livre.trim()) {
    return perna.selecao_livre;
  }
  
  // Fallback: normalizar apenas valores genéricos de mercado 1X2
  const selecao = perna.selecao;
  const marketLabels: Record<string, string> = {
    "Casa": "1",
    "Empate": "X",
    "Fora": "2",
  };
  
  // Se é um termo genérico do mercado, converte para 1/X/2
  if (marketLabels[selecao]) {
    return marketLabels[selecao];
  }
  
  // Caso contrário, usa a seleção original
  return selecao;
}

// Normaliza nome do bookmaker
function getBookmakerNome(perna: Perna): string {
  return perna.bookmaker_nome || perna.bookmaker || "Casa desconhecida";
}

// Retorna classe de cor baseado no resultado
function getResultadoColor(resultado: string | null | undefined): string {
  switch (resultado) {
    case "GREEN":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "RED":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "MEIO_GREEN":
      return "bg-teal-500/20 text-teal-400 border-teal-500/30";
    case "MEIO_RED":
      return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "VOID":
      return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    default:
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  }
}

function getResultadoLabel(resultado: string | null | undefined): string {
  switch (resultado) {
    case "GREEN": return "G";
    case "RED": return "R";
    case "MEIO_GREEN": return "½G";
    case "MEIO_RED": return "½R";
    case "VOID": return "V";
    default: return "";
  }
}

// Formata currency
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

// Determina o modelo da operação baseado no número de pernas
export function getModeloOperacao(pernas: Perna[]): string {
  if (pernas.length === 2) return "1-2";
  if (pernas.length === 3) return "1-X-2";
  return `${pernas.length} pernas`;
}

/**
 * Componente reutilizável para exibir pernas de apostas com múltiplas casas.
 * 
 * Uso:
 * - variant="card": Layout vertical para cards
 * - variant="list": Layout horizontal inline para listas
 * - variant="compact": Layout mínimo para espaços reduzidos
 */
export function ApostaPernasResumo({
  pernas,
  variant = "card",
  showStake = false,
  showResultado = true,
  className = "",
}: ApostaPernasResumoProps) {
  // CORREÇÃO: Filtrar pernas vazias/inválidas antes de renderizar
  // Uma perna é considerada válida se tem bookmaker e odd válida
  const pernasValidas = pernas.filter(perna => {
    const hasBookmaker = perna.bookmaker_id || perna.bookmaker_nome || perna.bookmaker;
    const hasOdd = perna.odd && perna.odd > 0;
    return hasBookmaker && hasOdd;
  });
  
  if (!pernasValidas || pernasValidas.length === 0) {
    return null;
  }

  // Variante compacta - inline badges
  if (variant === "compact") {
    return (
      <div className={`flex flex-wrap items-center gap-1 ${className}`}>
        {pernasValidas.map((perna, idx) => (
          <Badge
            key={idx}
            variant="outline"
            className="text-[9px] px-1 py-0 gap-0.5 font-normal"
          >
            <span className="font-semibold text-primary">
              {getSelecaoLabel(perna)}
            </span>
            <span className="text-muted-foreground">•</span>
            <span className="uppercase truncate max-w-[60px]">
              {getBookmakerNome(perna)}
            </span>
            <span className="text-muted-foreground">@</span>
            <span>{(perna.odd || 0).toFixed(2)}</span>
            {showResultado && perna.resultado && (
              <>
                <span className="text-muted-foreground">•</span>
                <span className={perna.resultado === "GREEN" ? "text-emerald-400" : perna.resultado === "RED" ? "text-red-400" : "text-gray-400"}>
                  {getResultadoLabel(perna.resultado)}
                </span>
              </>
            )}
          </Badge>
        ))}
      </div>
    );
  }

  // Variante lista - layout horizontal
  if (variant === "list") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {pernasValidas.map((perna, idx) => (
          <div
            key={idx}
            className="flex items-center gap-1 text-xs bg-muted/30 rounded px-1.5 py-0.5"
          >
            <span className="font-bold text-primary w-3 text-center">
              {getSelecaoLabel(perna)}
            </span>
            <span className="text-muted-foreground">–</span>
            <span className="font-medium uppercase truncate max-w-[80px] text-[11px]">
              {getBookmakerNome(perna)}
            </span>
            <span className="text-muted-foreground text-[10px]">@</span>
            <span className="text-[10px]">{(perna.odd || 0).toFixed(2)}</span>
            {showStake && perna.stake && (
              <>
                <span className="text-muted-foreground text-[10px]">•</span>
                <span className="text-[10px] font-medium">
                  {formatCurrency(perna.stake)}
                </span>
              </>
            )}
            {showResultado && perna.resultado && (
              <Badge
                variant="outline"
                className={`text-[9px] px-1 py-0 ml-1 ${getResultadoColor(perna.resultado)}`}
              >
                {getResultadoLabel(perna.resultado)}
              </Badge>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Variante card - layout vertical
  return (
    <div className={`space-y-1 ${className}`}>
      {pernasValidas.map((perna, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between gap-2 text-xs bg-muted/30 rounded-md px-2 py-1.5"
        >
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="font-bold text-primary w-4 flex-shrink-0 text-center">
              {getSelecaoLabel(perna)}
            </span>
            <span className="text-muted-foreground">–</span>
            <span className="font-medium truncate uppercase text-[11px]">
              {getBookmakerNome(perna)}
            </span>
            <span className="text-muted-foreground text-[10px]">•</span>
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              @{(perna.odd || 0).toFixed(2)}
            </span>
            {showStake && perna.stake && (
              <>
                <span className="text-muted-foreground text-[10px]">•</span>
                <span className="text-[10px] font-medium flex-shrink-0">
                  {formatCurrency(perna.stake)}
                </span>
              </>
            )}
            {perna.operador_nome && (
              <>
                <span className="text-muted-foreground text-[10px]">•</span>
                <span className="text-[10px] text-muted-foreground italic truncate max-w-[60px]">
                  {perna.operador_nome}
                </span>
              </>
            )}
          </div>
          {showResultado && perna.resultado && (
            <Badge
              variant="outline"
              className={`text-[9px] px-1 py-0 flex-shrink-0 ${getResultadoColor(perna.resultado)}`}
            >
              {getResultadoLabel(perna.resultado)}
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Componente de resumo compacto para exibir em linha única
 * Ex: "PARIMATCH @3.00 • MCGAMES @3.00 • BRILHANTE @3.10"
 */
export function ApostaPernasInline({
  pernas,
  className = "",
}: {
  pernas: Perna[];
  className?: string;
}) {
  // CORREÇÃO: Filtrar pernas vazias/inválidas
  const pernasValidas = pernas.filter(perna => {
    const hasBookmaker = perna.bookmaker_id || perna.bookmaker_nome || perna.bookmaker;
    const hasOdd = perna.odd && perna.odd > 0;
    return hasBookmaker && hasOdd;
  });
  
  if (!pernasValidas || pernasValidas.length === 0) {
    return null;
  }

  return (
    <span className={`text-xs text-muted-foreground ${className}`}>
      {pernasValidas.map((perna, idx) => (
        <span key={idx}>
          {idx > 0 && " • "}
          <span className="uppercase font-medium text-foreground">
            {getBookmakerNome(perna)}
          </span>
          <span className="ml-0.5">@{(perna.odd || 0).toFixed(2)}</span>
        </span>
      ))}
    </span>
  );
}
