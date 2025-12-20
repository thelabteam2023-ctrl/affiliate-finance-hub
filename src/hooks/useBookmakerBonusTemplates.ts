import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BonusTemplate {
  id: string;
  tipoBônus: string;
  tipoOutro?: string;
  percent: string;
  moeda: string;
  valorMax: string;
  oddMin: string;
  rolloverVezes: string;
  rolloverBase: string;
  prazo: string;
}

export interface BookmakerWithTemplates {
  id: string;
  nome: string;
  logo_url: string | null;
  bonus_enabled: boolean;
  bonus_multiplos_json: BonusTemplate[] | null;
}

interface UseBookmakerBonusTemplatesProps {
  bookmakerCatalogoId?: string | null;
}

export function useBookmakerBonusTemplates({ bookmakerCatalogoId }: UseBookmakerBonusTemplatesProps) {
  const [templates, setTemplates] = useState<BonusTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [bookmakerInfo, setBookmakerInfo] = useState<BookmakerWithTemplates | null>(null);

  const fetchTemplates = useCallback(async () => {
    if (!bookmakerCatalogoId) {
      setTemplates([]);
      setBookmakerInfo(null);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("bookmakers_catalogo")
        .select("id, nome, logo_url, bonus_enabled, bonus_multiplos_json")
        .eq("id", bookmakerCatalogoId)
        .single();

      if (error) {
        console.error("Error fetching bonus templates:", error);
        setTemplates([]);
        setBookmakerInfo(null);
        return;
      }

      if (data) {
        const bonusJson = data.bonus_multiplos_json as unknown as BonusTemplate[] | null;
        
        setBookmakerInfo({
          id: data.id,
          nome: data.nome,
          logo_url: data.logo_url,
          bonus_enabled: data.bonus_enabled,
          bonus_multiplos_json: bonusJson,
        });

        if (data.bonus_enabled && Array.isArray(bonusJson)) {
          // Map templates with generated IDs if missing
          const mappedTemplates = bonusJson.map((t, index) => ({
            ...t,
            id: t.id || `template-${index}`,
          }));
          setTemplates(mappedTemplates);
        } else {
          setTemplates([]);
        }
      }
    } catch (err) {
      console.error("Error in fetchTemplates:", err);
      setTemplates([]);
      setBookmakerInfo(null);
    } finally {
      setLoading(false);
    }
  }, [bookmakerCatalogoId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const hasTemplates = templates.length > 0;

  const getTemplateLabel = (template: BonusTemplate): string => {
    const tipo = template.tipoBônus === "OUTRO" && template.tipoOutro 
      ? template.tipoOutro 
      : formatBonusType(template.tipoBônus);
    
    const percent = template.percent ? `${template.percent}%` : "";
    const maxValue = template.valorMax 
      ? `até ${formatCurrency(Number(template.valorMax), template.moeda)}` 
      : "";

    return [tipo, percent, maxValue].filter(Boolean).join(" ");
  };

  return {
    templates,
    loading,
    hasTemplates,
    bookmakerInfo,
    getTemplateLabel,
    refetch: fetchTemplates,
  };
}

// Helper functions
function formatBonusType(type: string): string {
  const labels: Record<string, string> = {
    BOAS_VINDAS: "Boas-vindas",
    CASHBACK: "Cashback",
    FREE_BET: "Free Bet",
    RELOAD: "Reload",
    OUTRO: "Outro",
  };
  return labels[type] || type;
}

function formatCurrency(value: number, currency: string): string {
  const symbols: Record<string, string> = {
    BRL: "R$",
    USD: "$",
    EUR: "€",
    GBP: "£",
    USDT: "USDT",
  };
  const symbol = symbols[currency] || currency;
  return `${symbol} ${value.toLocaleString("pt-BR")}`;
}

// Helper to calculate rollover target
export function calculateRolloverTarget({
  bonusValue,
  depositAmount,
  multiplier,
  baseType,
}: {
  bonusValue: number;
  depositAmount?: number | null;
  multiplier: number;
  baseType: string;
}): number {
  const deposit = depositAmount || 0;

  switch (baseType) {
    case "DEPOSITO":
      return deposit * multiplier;
    case "BONUS":
      return bonusValue * multiplier;
    case "DEPOSITO_BONUS":
    default:
      return (deposit + bonusValue) * multiplier;
  }
}
