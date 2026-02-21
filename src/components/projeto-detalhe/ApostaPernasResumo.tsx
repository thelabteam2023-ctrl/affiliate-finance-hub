import { Badge, SelectionBadge } from "@/components/ui/badge";
import { Building2 } from "lucide-react";
import { cn, getFirstLastName } from "@/lib/utils";

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
  /** Função para buscar logo URL pelo nome da casa */
  getLogoUrl?: (name: string) => string | null;
}

// Cor neutra para badge de seleção - informativo, sem conotação de resultado
const NEUTRAL_SELECTION_STYLE = "bg-slate-600/25 text-slate-300 border-slate-500/40";

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

// Normaliza nome do bookmaker - agora com suporte a abreviação de parceiro
function getBookmakerNome(perna: Perna): string {
  return perna.bookmaker_nome || perna.bookmaker || "Casa desconhecida";
}

// Formata nome do bookmaker com vínculo abreviado
function formatBookmakerDisplay(nomeCompleto: string): string {
  const separatorIdx = nomeCompleto.indexOf(" - ");
  if (separatorIdx > 0) {
    const casa = nomeCompleto.substring(0, separatorIdx).trim();
    const vinculoRaw = nomeCompleto.substring(separatorIdx + 3).trim();
    const vinculoAbreviado = getFirstLastName(vinculoRaw);
    return `${casa} - ${vinculoAbreviado}`;
  }
  return nomeCompleto;
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

// Componente helper para exibir logo da casa
function BookmakerLogo({ 
  nome, 
  getLogoUrl,
  size = "default"
}: { 
  nome: string; 
  getLogoUrl?: (name: string) => string | null;
  size?: "default" | "small";
}) {
  const logoUrl = getLogoUrl?.(nome);
  const sizeClasses = size === "small" ? "h-6 w-6" : "h-10 w-10";
  const iconSize = size === "small" ? "h-3 w-3" : "h-5 w-5";
  
  if (logoUrl) {
    return (
      <img 
        src={logoUrl} 
        alt={nome} 
        className={cn(sizeClasses, "rounded-lg object-contain logo-blend p-1")}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }
  
  return (
    <div className={cn(sizeClasses, "rounded-lg bg-muted/30 flex items-center justify-center")}>
      <Building2 className={cn(iconSize, "text-muted-foreground")} />
    </div>
  );
}

/**
 * Componente reutilizável para exibir pernas de apostas com múltiplas casas.
 * 
 * Uso:
 * - variant="card": Layout vertical para cards (padronizado com SurebetCard)
 * - variant="list": Layout horizontal inline para listas
 * - variant="compact": Layout mínimo para espaços reduzidos
 */
export function ApostaPernasResumo({
  pernas,
  variant = "card",
  showStake = false,
  showResultado = true,
  className = "",
  getLogoUrl,
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
        {pernasValidas.map((perna, idx) => {
          const bookmakerNome = getBookmakerNome(perna);
          const bookmakerDisplay = formatBookmakerDisplay(bookmakerNome);
          
          return (
            <Badge
              key={idx}
              variant="outline"
              className="text-[9px] px-1 py-0 gap-0.5 font-normal"
            >
              <span className="font-semibold text-primary">
                {getSelecaoLabel(perna)}
              </span>
              <span className="text-muted-foreground">•</span>
              <span className="uppercase truncate max-w-[80px]">
                {bookmakerDisplay}
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
          );
        })}
      </div>
    );
  }

  // Variante lista - layout horizontal
  if (variant === "list") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {pernasValidas.map((perna, idx) => {
          const bookmakerNome = getBookmakerNome(perna);
          const bookmakerDisplay = formatBookmakerDisplay(bookmakerNome);
          
          return (
            <div
              key={idx}
              className="flex items-center gap-1 text-xs bg-muted/30 rounded px-1.5 py-0.5"
            >
              <span className="font-bold text-primary w-auto text-center shrink-0">
                {getSelecaoLabel(perna)}
              </span>
              <span className="text-muted-foreground">–</span>
              {getLogoUrl && (
                <BookmakerLogo nome={bookmakerNome} getLogoUrl={getLogoUrl} size="small" />
              )}
              <span className="font-medium uppercase truncate max-w-[100px] text-[11px]">
                {bookmakerDisplay}
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
          );
        })}
      </div>
    );
  }

  // Variante card - layout vertical (PADRONIZADO com SurebetCard)
  return (
    <div className={`space-y-2 ${className}`}>
      {pernasValidas.map((perna, idx) => {
        const bookmakerNome = getBookmakerNome(perna);
        const bookmakerDisplay = formatBookmakerDisplay(bookmakerNome);
        
        return (
          <div
            key={idx}
            className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 overflow-hidden"
          >
            {/* Badge de seleção - responsivo */}
            <div className="hidden sm:block w-[100px] md:w-[120px] shrink-0">
              <SelectionBadge 
                colorClassName={NEUTRAL_SELECTION_STYLE}
                minWidth={80}
                maxWidth={116}
              >
                {getSelecaoLabel(perna)}
              </SelectionBadge>
            </div>
            
            {/* Row with Logo + Nome + Odd/Stake */}
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 overflow-hidden">
              {/* Logo */}
              <div className="shrink-0">
                <BookmakerLogo nome={bookmakerNome} getLogoUrl={getLogoUrl} />
              </div>
              
              {/* Nome da casa + vínculo abreviado */}
              <span className="text-xs sm:text-sm text-muted-foreground truncate flex-1 uppercase min-w-0">
                {bookmakerDisplay}
              </span>
              
              {/* Odd e Stake à direita */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-medium whitespace-nowrap">@{(perna.odd || 0).toFixed(2)}</span>
                {showStake && perna.stake && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{formatCurrency(perna.stake)}</span>
                )}
              </div>
              
              {/* Resultado badge */}
              {showResultado && perna.resultado && (
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1 py-0 shrink-0 ${getResultadoColor(perna.resultado)}`}
                >
                  {getResultadoLabel(perna.resultado)}
                </Badge>
              )}
            </div>
            
            {/* Mobile: Selection badge below */}
            <div className="sm:hidden">
              <SelectionBadge 
                colorClassName={NEUTRAL_SELECTION_STYLE}
                minWidth={60}
                maxWidth={100}
              >
                {getSelecaoLabel(perna)}
              </SelectionBadge>
            </div>
          </div>
        );
      })}
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
  getLogoUrl,
}: {
  pernas: Perna[];
  className?: string;
  getLogoUrl?: (name: string) => string | null;
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
      {pernasValidas.map((perna, idx) => {
        const bookmakerNome = getBookmakerNome(perna);
        const bookmakerDisplay = formatBookmakerDisplay(bookmakerNome);
        
        return (
          <span key={idx}>
            {idx > 0 && " • "}
            <span className="uppercase font-medium text-foreground">
              {bookmakerDisplay}
            </span>
            <span className="ml-0.5">@{(perna.odd || 0).toFixed(2)}</span>
          </span>
        );
      })}
    </span>
  );
}
