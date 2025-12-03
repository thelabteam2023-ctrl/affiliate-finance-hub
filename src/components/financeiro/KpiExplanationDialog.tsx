import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type KpiType = 
  | "capital_operacional" 
  | "custos_operacionais" 
  | "despesas_administrativas" 
  | "margem_liquida"
  | "resultado" 
  | "custos" 
  | "despesas_operacionais" 
  | "lucro" 
  | null;

interface KpiExplanationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kpiType: KpiType;
}

const explanations: Record<string, { title: string; description: string; example?: string }> = {
  capital_operacional: {
    title: "Capital Operacional",
    description: "É o total de dinheiro disponível para suas operações. Soma o saldo em reais (BRL), dólares (USD) convertidos para reais, e o valor em criptomoedas também convertido. Este é o 'caixa' que você tem para trabalhar.",
    example: "Ex: R$ 50.000 em BRL + $2.000 USD (×5 = R$ 10.000) + $1.000 em crypto (×5 = R$ 5.000) = R$ 65.000 de capital operacional."
  },
  custos_operacionais: {
    title: "Custos Operacionais",
    description: "É a soma de todos os gastos relacionados à captação e manutenção de parceiros. Inclui: custos de aquisição (valores pagos para trazer novos parceiros através de indicadores, bônus de entrada, fornecedores) + despesas de indicação (comissões recorrentes e bônus de promoções pagos).",
    example: "Ex: Aquisição de 5 parceiros (R$ 2.500) + Comissões pagas no mês (R$ 1.500) + Bônus de meta (R$ 500) = R$ 4.500 em custos operacionais."
  },
  despesas_administrativas: {
    title: "Despesas Administrativas",
    description: "São os gastos do dia a dia do escritório que não estão ligados diretamente à aquisição de parceiros: contas de luz/energia, internet e 4G, pagamento de operadores e funcionários, aluguel do espaço, entre outros custos fixos e variáveis.",
    example: "Ex: Conta de energia R$ 300/mês, Internet R$ 150/mês, Salário do operador R$ 2.500/mês."
  },
  margem_liquida: {
    title: "Margem Líquida",
    description: "É o indicador de quanto sobra do seu capital depois de descontar todas as despesas. Mostra a 'saúde financeira' real do negócio. Se positivo, você tem lucro; se negativo, está operando no prejuízo.",
    example: "Fórmula: Margem = Capital Operacional - Custos Operacionais - Despesas Administrativas. Ex: R$ 65.000 - R$ 4.500 - R$ 3.000 = R$ 57.500"
  },
  resultado: {
    title: "Resultado Operacional",
    description: "É o dinheiro que você ganhou com as operações de apostas. Representa a diferença entre o que você sacou das casas de apostas (seus ganhos) e o que você depositou nelas (investimento). Se esse número é positivo, suas operações estão dando lucro.",
    example: "Ex: Se você depositou R$ 10.000 e sacou R$ 15.000, seu resultado operacional é R$ 5.000."
  },
  custos: {
    title: "Custos de Aquisição",
    description: "É quanto você gastou para trazer novos parceiros para o seu negócio. Inclui os valores configurados nas parcerias: pagamentos combinados com indicadores (quem trouxe os parceiros), valores de entrada prometidos aos próprios parceiros, e pagamentos a fornecedores de leads.",
    example: "Ex: Se cada parceiro custa R$ 500 para o indicador + R$ 200 de bônus de entrada, e você trouxe 10 parceiros, o custo de aquisição é R$ 7.000."
  },
  despesas_operacionais: {
    title: "Despesas Operacionais",
    description: "São os pagamentos recorrentes já realizados relacionados ao programa de captação: comissões mensais pagas aos indicadores pelos parceiros ativos e bônus de promoções efetivamente pagos.",
    example: "Ex: Comissão mensal de R$ 100 paga a um indicador por cada parceiro ativo, ou bônus de R$ 500 pago por atingir meta de indicação."
  },
  lucro: {
    title: "Lucro Líquido",
    description: "É o que realmente sobra no seu bolso depois de pagar todas as despesas. É calculado subtraindo do seu resultado operacional todos os custos de aquisição, despesas operacionais e despesas administrativas.",
    example: "Fórmula: Lucro = Resultado Operacional - Custos de Aquisição - Despesas Operacionais - Despesas Administrativas"
  },
};

export function KpiExplanationDialog({ open, onOpenChange, kpiType }: KpiExplanationDialogProps) {
  if (!kpiType) return null;

  const info = explanations[kpiType];
  if (!info) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{info.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {info.description}
          </p>
          {info.example && (
            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-xs text-muted-foreground italic">
                {info.example}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
