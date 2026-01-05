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
    console.log(`[ForceLogout] Chamando RPC admin_force_global_logout...`);

    // Criar cliente admin com service role
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Usar a função RPC que tem acesso ao schema auth via SECURITY DEFINER
    const { data: result, error: rpcError } = await adminClient.rpc('admin_force_global_logout', {
      p_admin_user_id: user.id
    });

    if (rpcError) {
      console.error("[ForceLogout] Erro RPC:", rpcError);
      return new Response(
        JSON.stringify({ error: `Erro ao executar logout: ${rpcError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ForceLogout] Resultado:`, result);
    console.log(`[ForceLogout] Sessions deletadas: ${result?.sessions_deleted}`);
    console.log(`[ForceLogout] Refresh tokens deletados: ${result?.refresh_tokens_deleted}`);
    console.log(`[ForceLogout] Login history atualizado: ${result?.login_history_updated}`);

    const totalInvalidated = (result?.sessions_deleted || 0) + (result?.refresh_tokens_deleted || 0);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Logout forçado executado com sucesso`,
        stats: {
          sessions_deleted: result?.sessions_deleted || 0,
          refresh_tokens_deleted: result?.refresh_tokens_deleted || 0,
          login_history_updated: result?.login_history_updated || 0,
          total_invalidated: totalInvalidated,
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