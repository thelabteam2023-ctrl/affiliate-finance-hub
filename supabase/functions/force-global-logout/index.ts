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

    // Criar cliente admin com service role
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log(`[ForceLogout] Iniciando invalidação de sessões...`);
    console.log(`[ForceLogout] Admin executando: ${user.email} (${user.id})`);

    // Abordagem direta: deletar sessões e refresh tokens via SQL usando RPC
    // Primeiro, vamos contar quantas sessões existem (exceto do admin atual)
    const { data: sessionCount, error: countError } = await adminClient.rpc('count_active_sessions_except_user', {
      excluded_user_id: user.id
    });

    // Se a função RPC não existe, usar abordagem alternativa via Auth Admin API
    let logoutCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Buscar todos os usuários para fazer logout
    const { data: allUsers, error: usersError } = await adminClient.auth.admin.listUsers();
    if (usersError) {
      throw new Error(`Erro ao listar usuários: ${usersError.message}`);
    }

    console.log(`[ForceLogout] Encontrados ${allUsers.users.length} usuários`);

    // Usar a GoTrue Admin API corretamente - deletar usuário temporariamente não é opção
    // Vamos usar o endpoint REST direto para invalidar sessões

    const gotrueUrl = `${supabaseUrl}/auth/v1`;
    
    for (const targetUser of allUsers.users) {
      // Não deslogar o próprio admin
      if (targetUser.id === user.id) {
        console.log(`[ForceLogout] Pulando próprio admin: ${targetUser.email}`);
        continue;
      }

      try {
        // Usar o endpoint REST para logout global do usuário
        const logoutResponse = await fetch(`${gotrueUrl}/admin/users/${targetUser.id}/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'apikey': supabaseServiceKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ scope: 'global' }),
        });

        if (!logoutResponse.ok) {
          const errorText = await logoutResponse.text();
          console.error(`[ForceLogout] Erro HTTP ao deslogar ${targetUser.email}: ${logoutResponse.status} - ${errorText}`);
          errorCount++;
          errors.push(`${targetUser.email}: HTTP ${logoutResponse.status}`);
        } else {
          console.log(`[ForceLogout] Deslogado com sucesso: ${targetUser.email}`);
          logoutCount++;
        }
      } catch (err) {
        console.error(`[ForceLogout] Exceção ao deslogar ${targetUser.email}:`, err);
        errorCount++;
        errors.push(`${targetUser.email}: ${String(err)}`);
      }
    }

    // Marcar todas as sessões como encerradas no login_history (exceto do admin atual)
    const { error: historyError, count: updatedCount } = await adminClient
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
      errors.push(`login_history: ${historyError.message}`);
    } else {
      console.log(`[ForceLogout] login_history atualizado`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Logout forçado executado`,
        stats: {
          total_users: allUsers.users.length,
          logged_out: logoutCount,
          errors: errorCount,
          skipped: 1, // o próprio admin
        },
        errors: errors.length > 0 ? errors : undefined,
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
