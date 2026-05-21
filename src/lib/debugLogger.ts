import { supabase } from "@/integrations/supabase/client";

export type DebugLogParams = {
  modulo: string;
  evento: string;
  payload?: any;
  resposta?: any;
  erro?: any;
};

export const logDebug = async ({
  modulo,
  evento,
  payload,
  resposta,
  erro
}: DebugLogParams) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    // Convert error objects to strings or JSON for storage
    const formattedErro = erro instanceof Error ? {
      message: erro.message,
      stack: erro.stack,
      ...erro
    } : erro;

    const { error } = await supabase.from('debug_logs').insert({
      modulo,
      evento,
      payload,
      resposta,
      erro: typeof formattedErro === 'object' ? JSON.stringify(formattedErro) : String(formattedErro || ''),
      user_id: user?.id
    });

    if (error) {
      console.warn('[Telemetry] Failed to save debug log:', error);
    }
  } catch (err) {
    console.error('[Telemetry] Error in logger:', err);
  }
};
