import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verificar autorização
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Criar cliente com token do usuário para verificar se é system owner
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verificar usuário autenticado
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar se é system owner
    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("is_system_owner")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.is_system_owner) {
      return new Response(
        JSON.stringify({ error: "Apenas System Owner pode executar esta ação" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ForceLogout] Admin executando: ${user.email} (${user.id})`);
    console.log(`[ForceLogout] Iniciando invalidação de sessões via SQL direto...`);

    // Criar cliente admin com service role para acessar auth schema
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: 'auth' }
    });

    // ABORDAGEM CORRETA: Deletar sessões diretamente das tabelas auth
    // 1. Deletar refresh_tokens (exceto do admin atual)
    const { error: refreshError, count: refreshCount } = await adminClient
      .from("refresh_tokens")
      .delete({ count: 'exact' })
      .neq("user_id", user.id);

    if (refreshError) {
      console.error("[ForceLogout] Erro ao deletar refresh_tokens:", refreshError);
    } else {
      console.log(`[ForceLogout] refresh_tokens deletados: ${refreshCount}`);
    }

    // 2. Deletar sessions (exceto do admin atual)
    const { error: sessionsError, count: sessionsCount } = await adminClient
      .from("sessions")
      .delete({ count: 'exact' })
      .neq("user_id", user.id);

    if (sessionsError) {
      console.error("[ForceLogout] Erro ao deletar sessions:", sessionsError);
    } else {
      console.log(`[ForceLogout] sessions deletadas: ${sessionsCount}`);
    }

    // Voltar ao schema public para atualizar login_history
    const publicClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Marcar todas as sessões como encerradas no login_history (exceto do admin atual)
    const { error: historyError, count: historyCount } = await publicClient
      .from("login_history")
      .update({
        is_active: false,
        logout_at: new Date().toISOString(),
        session_status: "force_logout",
      })
      .eq("is_active", true)
      .neq("user_id", user.id);

    if (historyError) {
      console.error("[ForceLogout] Erro ao atualizar login_history:", historyError);
    } else {
      console.log(`[ForceLogout] login_history atualizado: ${historyCount} registros`);
    }

    const totalInvalidated = (refreshCount || 0) + (sessionsCount || 0);
    console.log(`[ForceLogout] Total de sessões invalidadas: ${totalInvalidated}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Logout forçado executado com sucesso`,
        stats: {
          refresh_tokens_deleted: refreshCount || 0,
          sessions_deleted: sessionsCount || 0,
          login_history_updated: historyCount || 0,
          admin_preserved: user.email,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[ForceLogout] Erro:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
