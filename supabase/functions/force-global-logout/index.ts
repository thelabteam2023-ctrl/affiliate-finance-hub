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

    // Buscar todos os usuários
    const { data: allUsers, error: usersError } = await adminClient.auth.admin.listUsers();
    if (usersError) {
      throw new Error(`Erro ao listar usuários: ${usersError.message}`);
    }

    console.log(`[ForceLogout] Encontrados ${allUsers.users.length} usuários`);

    // Contador de logouts
    let logoutCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Fazer logout de cada usuário (exceto o admin que está executando)
    for (const targetUser of allUsers.users) {
      // Não deslogar o próprio admin que está executando
      if (targetUser.id === user.id) {
        console.log(`[ForceLogout] Pulando próprio admin: ${targetUser.email}`);
        continue;
      }

      try {
        // Invalidar todas as sessões do usuário
        const { error: signOutError } = await adminClient.auth.admin.signOut(
          targetUser.id,
          "global" // Invalida TODAS as sessões
        );

        if (signOutError) {
          console.error(`[ForceLogout] Erro ao deslogar ${targetUser.email}:`, signOutError);
          errorCount++;
          errors.push(`${targetUser.email}: ${signOutError.message}`);
        } else {
          console.log(`[ForceLogout] Deslogado: ${targetUser.email}`);
          logoutCount++;
        }
      } catch (err) {
        console.error(`[ForceLogout] Exceção ao deslogar ${targetUser.email}:`, err);
        errorCount++;
        errors.push(`${targetUser.email}: ${String(err)}`);
      }
    }

    // Marcar todas as sessões como encerradas no login_history
    const { error: historyError } = await adminClient
      .from("login_history")
      .update({
        is_active: false,
        logout_at: new Date().toISOString(),
        session_status: "force_logout",
      })
      .eq("is_active", true);

    if (historyError) {
      console.error("[ForceLogout] Erro ao atualizar login_history:", historyError);
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
