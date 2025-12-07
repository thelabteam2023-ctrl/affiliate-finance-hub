import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const MARCOS_LUCRO = [5000, 10000, 20000, 25000, 30000];

interface ParceiroLucroData {
  parceiro_id: string;
  parceiro_nome: string;
  lucro_total: number;
}

export function useParceiroLucroAlertas(lucroData: ParceiroLucroData[]) {
  useEffect(() => {
    if (lucroData.length === 0) return;
    
    const checkAndCreateAlerts = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Fetch existing alerts to avoid duplicates
        const { data: existingAlerts, error: alertsError } = await supabase
          .from("parceiro_lucro_alertas")
          .select("parceiro_id, marco_valor")
          .eq("user_id", user.id);

        if (alertsError) throw alertsError;

        // Create set of existing alerts for quick lookup
        const existingSet = new Set(
          (existingAlerts || []).map(a => `${a.parceiro_id}-${a.marco_valor}`)
        );

        // Check each partner for new milestones
        const newAlerts: Array<{
          parceiro_id: string;
          marco_valor: number;
          lucro_atual: number;
          user_id: string;
        }> = [];

        for (const parceiro of lucroData) {
          if (parceiro.lucro_total <= 0) continue;

          for (const marco of MARCOS_LUCRO) {
            const alertKey = `${parceiro.parceiro_id}-${marco}`;
            
            // Check if milestone reached and not already alerted
            if (parceiro.lucro_total >= marco && !existingSet.has(alertKey)) {
              newAlerts.push({
                parceiro_id: parceiro.parceiro_id,
                marco_valor: marco,
                lucro_atual: parceiro.lucro_total,
                user_id: user.id,
              });
            }
          }
        }

        // Insert new alerts
        if (newAlerts.length > 0) {
          const { error: insertError } = await supabase
            .from("parceiro_lucro_alertas")
            .insert(newAlerts);

          if (insertError) throw insertError;

          // Show toast notifications for new milestones
          for (const alert of newAlerts) {
            const parceiro = lucroData.find(p => p.parceiro_id === alert.parceiro_id);
            toast.success(
              `🎉 ${parceiro?.parceiro_nome || "Parceiro"} atingiu R$ ${alert.marco_valor.toLocaleString("pt-BR")} de lucro!`
            );
          }
        }
      } catch (error) {
        console.error("Erro ao verificar alertas de lucro:", error);
      }
    };

    checkAndCreateAlerts();
  }, [lucroData]);
}

export async function fetchParceiroLucroAlertas() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("parceiro_lucro_alertas")
      .select(`
        *,
        parceiro:parceiros(nome)
      `)
      .eq("user_id", user.id)
      .eq("notificado", false)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Erro ao buscar alertas de lucro:", error);
    return [];
  }
}

export async function markAlertasAsNotified(alertIds: string[]) {
  try {
    const { error } = await supabase
      .from("parceiro_lucro_alertas")
      .update({ notificado: true })
      .in("id", alertIds);

    if (error) throw error;
  } catch (error) {
    console.error("Erro ao marcar alertas como notificados:", error);
  }
}
