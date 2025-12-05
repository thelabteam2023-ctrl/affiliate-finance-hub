import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ParceiroStatusIconProps {
  diasRestantes: number | null;
  pagamentoRealizado: boolean;
  className?: string;
}

export function ParceiroStatusIcon({ 
  diasRestantes, 
  pagamentoRealizado, 
  className 
}: ParceiroStatusIconProps) {
  // Se não tem parceria ativa, não renderiza
  if (diasRestantes === null) return null;

  // Lógica de cores:
  // Vermelho: ≤ 5 dias OU pagamento pendente
  // Verde claro (lime): Pago + 6-20 dias
  // Verde (emerald): Pago + > 20 dias
  const getColorClasses = () => {
    if (diasRestantes <= 5 || !pagamentoRealizado) {
      return {
        bg: "bg-red-500/10",
        text: "text-red-400",
        animate: "",
      };
    }
    if (diasRestantes <= 20) {
      return {
        bg: "bg-lime-500/10",
        text: "text-lime-400",
        animate: "",
      };
    }
    return {
      bg: "bg-emerald-500/10",
      text: "text-emerald-400",
      animate: "",
    };
  };

  const getTooltipContent = () => {
    const diasText = `📅 Dias restantes: ${diasRestantes}`;
    const pagamentoText = pagamentoRealizado ? "✓ Pago" : "⏳ Pendente";
    
    if (diasRestantes <= 5) {
      return (
        <div className="text-sm">
          <p>{diasText}</p>
          <p>💰 {pagamentoText}</p>
          <p className="text-red-400 font-semibold">⚠️ Encerrar parceria!</p>
        </div>
      );
    }
    if (!pagamentoRealizado) {
      return (
        <div className="text-sm">
          <p>{diasText}</p>
          <p className="text-red-400">💰 Pagamento pendente</p>
        </div>
      );
    }
    if (diasRestantes <= 20) {
      return (
        <div className="text-sm">
          <p>{diasText}</p>
          <p>💰 {pagamentoText}</p>
          <p className="text-lime-400">⏳ Vencimento próximo</p>
        </div>
      );
    }
    return (
      <div className="text-sm">
        <p>{diasText}</p>
        <p>💰 {pagamentoText}</p>
      </div>
    );
  };

  const colors = getColorClasses();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center cursor-help",
            colors.bg,
            colors.animate,
            className
          )}
        >
          {/* SVG customizado: Ampulheta com cifrão */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={colors.text}
          >
            {/* Ampulheta estilizada */}
            <path
              d="M6 2H18V6C18 8.21 16.21 10 14 10H10C7.79 10 6 8.21 6 6V2Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path
              d="M6 22H18V18C18 15.79 16.21 14 14 14H10C7.79 14 6 15.79 6 18V22Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path
              d="M10 10L14 14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M14 10L10 14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            {/* Cifrão sobreposto */}
            <text
              x="12"
              y="12"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="8"
              fontWeight="bold"
              fill="currentColor"
            >
              $
            </text>
          </svg>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        {getTooltipContent()}
      </TooltipContent>
    </Tooltip>
  );
}
