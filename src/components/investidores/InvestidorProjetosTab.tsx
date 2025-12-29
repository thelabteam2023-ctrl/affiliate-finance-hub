import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FolderOpen, ExternalLink, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

interface ProjetoVinculado {
  id: string;
  nome: string;
  status: string;
  percentual_investidor: number | null;
  base_calculo_investidor: string | null;
  created_at: string;
  lucro_total?: number;
}

interface InvestidorProjetosTabProps {
  investidorId: string;
}

const formatCurrency = (value: number, currency: "BRL" | "USD" = "BRL") => {
  return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
  }).format(value);
};

const getStatusBadge = (status: string) => {
  const statusConfig: Record<string, { label: string; className: string }> = {
    EM_ANDAMENTO: { 
      label: "Em Andamento", 
      className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" 
    },
    ATIVO: { 
      label: "Ativo", 
      className: "bg-primary/10 text-primary border-primary/30" 
    },
    FINALIZADO: { 
      label: "Finalizado", 
      className: "bg-muted/50 text-muted-foreground border-muted" 
    },
    PAUSADO: { 
      label: "Pausado", 
      className: "bg-warning/10 text-warning border-warning/30" 
    },
  };

  const config = statusConfig[status] || { 
    label: status, 
    className: "bg-muted/50 text-muted-foreground" 
  };

  return (
    <Badge variant="outline" className={`text-[10px] ${config.className}`}>
      {config.label}
    </Badge>
  );
};

export function InvestidorProjetosTab({ investidorId }: InvestidorProjetosTabProps) {
  const navigate = useNavigate();
  const [projetos, setProjetos] = useState<ProjetoVinculado[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjetos();
  }, [investidorId]);

  const fetchProjetos = async () => {
    setLoading(true);
    try {
      // Buscar projetos vinculados ao investidor
      const { data, error } = await supabase
        .from("projetos")
        .select(`
          id,
          nome,
          status,
          percentual_investidor,
          base_calculo_investidor,
          created_at
        `)
        .eq("investidor_id", investidorId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Buscar lucro de cada projeto
      const projetosComLucro = await Promise.all(
        (data || []).map(async (projeto) => {
          const { data: apostasData } = await supabase
            .from("apostas_unificada")
            .select("lucro_prejuizo")
            .eq("projeto_id", projeto.id)
            .not("lucro_prejuizo", "is", null);

          const lucroTotal = apostasData?.reduce(
            (sum, a) => sum + (a.lucro_prejuizo || 0),
            0
          ) || 0;

          return {
            ...projeto,
            lucro_total: lucroTotal,
          };
        })
      );

      setProjetos(projetosComLucro);
    } catch (error) {
      console.error("Erro ao carregar projetos:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateToProjeto = (projetoId: string) => {
    navigate(`/projetos/${projetoId}`);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (projetos.length === 0) {
    return (
      <Card className="bg-card/50">
        <CardContent className="py-12 text-center">
          <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">
            Nenhum projeto vinculado a este investidor.
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Vincule o investidor a projetos na página de edição do projeto.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {projetos.map((projeto) => {
        const lucro = projeto.lucro_total || 0;
        const moeda: "BRL" | "USD" = "BRL"; // Default to BRL
        return (
          <Card 
            key={projeto.id} 
            className="bg-card/50 hover:bg-card/80 transition-colors cursor-pointer group"
            onClick={() => handleNavigateToProjeto(projeto.id)}
          >
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-semibold text-sm truncate">{projeto.nome}</h4>
                    {getStatusBadge(projeto.status)}
                  </div>
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {projeto.percentual_investidor && (
                      <span className="flex items-center gap-1">
                        <span className="font-medium text-primary">
                          {projeto.percentual_investidor}%
                        </span>
                        <span>de participação</span>
                      </span>
                    )}
                    {projeto.base_calculo_investidor && (
                      <span className="text-muted-foreground/70">
                        Base: {projeto.base_calculo_investidor === "LUCRO_BRUTO" ? "Lucro Bruto" : "Lucro Líquido"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">
                    Resultado Projeto
                  </p>
                  <div className="flex items-center justify-end gap-1.5">
                    {lucro > 0 ? (
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                    ) : lucro < 0 ? (
                      <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                    ) : (
                      <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span
                      className={`font-mono font-semibold ${
                        lucro > 0
                          ? "text-emerald-500"
                          : lucro < 0
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                    >
                      {lucro > 0 ? "+" : ""}{formatCurrency(lucro, moeda)}
                    </span>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNavigateToProjeto(projeto.id);
                  }}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
