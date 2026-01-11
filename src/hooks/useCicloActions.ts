import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface EncerrarCicloParams {
  cicloId: string;
  gatilho: "META" | "PRAZO";
  excedente?: number;
}

interface EncerrarCicloResult {
  success: boolean;
  novoCicloId?: string;
  error?: string;
}

/**
 * Hook para ações de ciclo
 */
export function useCicloActions() {
  /**
   * Encerra um ciclo e cria o próximo automaticamente
   * Usa a função do banco encerrar_ciclo_e_criar_proximo
   */
  const encerrarCiclo = async ({
    cicloId,
    gatilho,
    excedente = 0,
  }: EncerrarCicloParams): Promise<EncerrarCicloResult> => {
    try {
      const { data, error } = await supabase.rpc("encerrar_ciclo_e_criar_proximo", {
        p_ciclo_id: cicloId,
        p_gatilho: gatilho,
        p_excedente: excedente,
      });

      if (error) throw error;

      return {
        success: true,
        novoCicloId: data as string,
      };
    } catch (error: any) {
      console.error("Erro ao encerrar ciclo:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  };

  /**
   * Encerra ciclo por meta atingida
   */
  const encerrarPorMeta = async (
    cicloId: string,
    valorAtual: number,
    metaVolume: number
  ): Promise<EncerrarCicloResult> => {
    const excedente = Math.max(0, valorAtual - metaVolume);
    
    const result = await encerrarCiclo({
      cicloId,
      gatilho: "META",
      excedente,
    });

    if (result.success) {
      toast.success(
        excedente > 0
          ? `Ciclo encerrado por meta! Excedente de R$ ${excedente.toFixed(2)} transferido.`
          : "Ciclo encerrado por meta atingida!"
      );
    } else {
      toast.error("Erro ao encerrar ciclo: " + result.error);
    }

    return result;
  };

  /**
   * Encerra ciclo por prazo expirado
   */
  const encerrarPorPrazo = async (cicloId: string): Promise<EncerrarCicloResult> => {
    const result = await encerrarCiclo({
      cicloId,
      gatilho: "PRAZO",
      excedente: 0,
    });

    if (result.success) {
      toast.success("Ciclo encerrado por prazo expirado. Próximo ciclo criado.");
    } else {
      toast.error("Erro ao encerrar ciclo: " + result.error);
    }

    return result;
  };

  /**
   * Verifica e encerra todos os ciclos vencidos
   */
  const verificarCiclosVencidos = async (): Promise<number> => {
    try {
      const { data, error } = await supabase.rpc("verificar_ciclos_vencidos");
      
      if (error) throw error;
      
      const count = data as number;
      if (count > 0) {
        toast.info(`${count} ciclo(s) encerrado(s) por prazo vencido.`);
      }
      
      return count;
    } catch (error: any) {
      console.error("Erro ao verificar ciclos vencidos:", error);
      return 0;
    }
  };

  return {
    encerrarCiclo,
    encerrarPorMeta,
    encerrarPorPrazo,
    verificarCiclosVencidos,
  };
}
