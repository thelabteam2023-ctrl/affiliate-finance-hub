import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface KpiExplanationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kpiType: "resultado" | "custos" | "despesas_operacionais" | "despesas_administrativas" | "lucro" | null;
}

const explanations: Record<string, { title: string; description: string; example?: string }> = {
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
  despesas_administrativas: {
    title: "Despesas Administrativas",
    description: "São os gastos do dia a dia do escritório que não estão ligados diretamente à aquisição de parceiros: contas de luz/energia, internet e 4G, pagamento de operadores e funcionários, aluguel do espaço, entre outros custos fixos e variáveis.",
    example: "Ex: Conta de energia R$ 300/mês, Internet R$ 150/mês, Salário do operador R$ 2.500/mês."
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
