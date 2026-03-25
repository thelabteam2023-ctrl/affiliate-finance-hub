import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { encode as base64Encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-workspace-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY")!;

async function getKey(): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
  return crypto.subtle.importKey("raw", keyData, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return base64Encode(new Uint8Array(hashBuffer));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "validate";

    if (action === "validate") {
      const { token } = await req.json();
      if (!token || typeof token !== "string" || token.length < 32) {
        return new Response(
          JSON.stringify({ valid: false, error: "Token inválido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokenHash = await hashToken(token);
      const { data: result, error } = await supabaseAdmin.rpc("validate_supplier_token", {
        p_token_hash: tokenHash,
      });

      if (error) {
        console.error("RPC error:", error);
        return new Response(
          JSON.stringify({ valid: false, error: "Erro interno" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!result?.valid) {
        return new Response(
          JSON.stringify({ valid: false, error: result?.error || "Token inválido" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get-titular-credentials") {
      const { token, titular_id } = await req.json();

      if (!token || typeof token !== "string" || token.length < 32 || !titular_id) {
        return new Response(
          JSON.stringify({ error: "Token ou titular inválido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokenHash = await hashToken(token);
      const { data, error } = await supabaseAdmin.rpc("get_titular_existing_credentials_by_supplier_token", {
        p_token_hash: tokenHash,
        p_titular_id: titular_id,
      });

      if (error) {
        console.error("get-titular-credentials error:", error);
        return new Response(
          JSON.stringify({ error: "Erro ao buscar credenciais" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const credentials = await Promise.all(
        (data || []).map(async (row: { bookmaker_catalogo_id: string; login_username: string; login_password: string }) => {
          let loginPassword = "";
          try {
            const key = await getKey();
            const combined = Uint8Array.from(atob(row.login_password || ""), (c) => c.charCodeAt(0));
            const iv = combined.slice(0, 12);
            const ciphertext = combined.slice(12);
            const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
            loginPassword = new TextDecoder().decode(decrypted);
          } catch {
            try {
              loginPassword = atob(row.login_password || "");
            } catch {
              loginPassword = row.login_password || "";
            }
          }

          return {
            bookmaker_catalogo_id: row.bookmaker_catalogo_id,
            login_username: row.login_username,
            login_password: loginPassword,
          };
        })
      );

      return new Response(JSON.stringify({ credentials }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create-accounts") {
      const { token, titular_id, accounts } = await req.json();

      if (!token || typeof token !== "string" || token.length < 32 || !titular_id || !Array.isArray(accounts) || accounts.length === 0) {
        return new Response(
          JSON.stringify({ error: "Dados inválidos para criação" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const normalizedAccounts = await Promise.all(
        accounts.map(async (account) => {
          if (!account?.bookmaker_catalogo_id || !account?.login_username || !account?.password) {
            throw new Error("Conta inválida");
          }

          const loginUsername = String(account.login_username).trim();
          const password = String(account.password).trim();

          if (!loginUsername || !password) {
            throw new Error("Login e senha são obrigatórios");
          }

          if (loginUsername.length > 100 || password.length > 200) {
            throw new Error("Login ou senha excede o limite permitido");
          }

          return {
            bookmaker_catalogo_id: String(account.bookmaker_catalogo_id),
            login_username: loginUsername,
            login_password_encrypted: await encrypt(password),
            moeda: String(account.moeda || "BRL"),
          };
        })
      );

      const tokenHash = await hashToken(token);
      const { data, error } = await supabaseAdmin.rpc("create_supplier_bookmaker_accounts_by_token", {
        p_token_hash: tokenHash,
        p_titular_id: titular_id,
        p_accounts: normalizedAccounts,
      });

      if (error) {
        console.error("create-accounts error:", error);
        return new Response(
          JSON.stringify({ error: error.message || "Erro ao criar contas" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ success: true, inserted: data ?? 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update-account") {
      const { token, account_id, login_username, password, observacoes } = await req.json();

      if (!token || typeof token !== "string" || token.length < 32 || !account_id) {
        return new Response(
          JSON.stringify({ error: "Dados inválidos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate token
      const tokenHash = await hashToken(token);
      const { data: validation, error: valError } = await supabaseAdmin.rpc("validate_supplier_token", {
        p_token_hash: tokenHash,
      });
      if (valError || !validation?.valid) {
        return new Response(
          JSON.stringify({ error: "Token inválido" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify account belongs to this supplier workspace
      const { data: account, error: accError } = await supabaseAdmin
        .from("supplier_bookmaker_accounts")
        .select("id, supplier_workspace_id")
        .eq("id", account_id)
        .eq("supplier_workspace_id", validation.supplier_workspace_id)
        .single();

      if (accError || !account) {
        return new Response(
          JSON.stringify({ error: "Conta não encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (login_username && typeof login_username === "string") {
        const trimmed = login_username.trim();
        if (trimmed.length > 100) throw new Error("Login excede o limite");
        updates.login_username = trimmed;
      }
      if (password && typeof password === "string") {
        const trimmed = password.trim();
        if (trimmed.length > 200) throw new Error("Senha excede o limite");
        updates.login_password_encrypted = await encrypt(trimmed);
      }
      if (observacoes !== undefined) {
        updates.observacoes = observacoes;
      }

      const { error: updateError } = await supabaseAdmin
        .from("supplier_bookmaker_accounts")
        .update(updates)
        .eq("id", account_id);

      if (updateError) {
        console.error("update-account error:", updateError);
        return new Response(
          JSON.stringify({ error: "Erro ao atualizar conta" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete-account") {
      const { token, account_id } = await req.json();

      if (!token || typeof token !== "string" || token.length < 32 || !account_id) {
        return new Response(
          JSON.stringify({ error: "Dados inválidos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokenHash = await hashToken(token);
      const { data: validation, error: valError } = await supabaseAdmin.rpc("validate_supplier_token", {
        p_token_hash: tokenHash,
      });
      if (valError || !validation?.valid) {
        return new Response(
          JSON.stringify({ error: "Token inválido" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify account belongs to this supplier workspace and has zero balance
      const { data: account, error: accError } = await supabaseAdmin
        .from("supplier_bookmaker_accounts")
        .select("id, saldo_atual, supplier_workspace_id")
        .eq("id", account_id)
        .eq("supplier_workspace_id", validation.supplier_workspace_id)
        .single();

      if (accError || !account) {
        return new Response(
          JSON.stringify({ error: "Conta não encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (Number(account.saldo_atual) !== 0) {
        return new Response(
          JSON.stringify({ error: "Não é possível excluir conta com saldo. Zere o saldo primeiro." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Soft delete - set status to INATIVA
      const { error: delError } = await supabaseAdmin
        .from("supplier_bookmaker_accounts")
        .update({ status: "INATIVA", updated_at: new Date().toISOString() })
        .eq("id", account_id);

      if (delError) {
        console.error("delete-account error:", delError);
        return new Response(
          JSON.stringify({ error: "Erro ao excluir conta" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "decrypt-password") {
      const { token, account_id } = await req.json();

      if (!token || typeof token !== "string" || token.length < 32 || !account_id) {
        return new Response(
          JSON.stringify({ error: "Dados inválidos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokenHash = await hashToken(token);
      const { data: validation, error: valError } = await supabaseAdmin.rpc("validate_supplier_token", {
        p_token_hash: tokenHash,
      });
      if (valError || !validation?.valid) {
        return new Response(
          JSON.stringify({ error: "Token inválido" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: account, error: accError } = await supabaseAdmin
        .from("supplier_bookmaker_accounts")
        .select("login_password_encrypted, supplier_workspace_id")
        .eq("id", account_id)
        .eq("supplier_workspace_id", validation.supplier_workspace_id)
        .single();

      if (accError || !account) {
        return new Response(
          JSON.stringify({ error: "Conta não encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let password = "";
      try {
        const key = await getKey();
        const combined = Uint8Array.from(atob(account.login_password_encrypted || ""), (c) => c.charCodeAt(0));
        const iv = combined.slice(0, 12);
        const ciphertext = combined.slice(12);
        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
        password = new TextDecoder().decode(decrypted);
      } catch {
        try {
          password = atob(account.login_password_encrypted || "");
        } catch {
          password = account.login_password_encrypted || "";
        }
      }

      return new Response(JSON.stringify({ password }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update-titular") {
      const { token, titular_id, nome, email, telefone, data_nascimento, endereco, cep, cidade, observacoes, data_inicio_parceria, data_fim_parceria } = await req.json();

      if (!token || typeof token !== "string" || token.length < 32 || !titular_id) {
        return new Response(
          JSON.stringify({ error: "Dados inválidos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokenHash = await hashToken(token);
      const { data: validation, error: valError } = await supabaseAdmin.rpc("validate_supplier_token", {
        p_token_hash: tokenHash,
      });
      if (valError || !validation?.valid) {
        return new Response(
          JSON.stringify({ error: "Token inválido" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify titular belongs to this supplier workspace
      const { data: titular, error: titError } = await supabaseAdmin
        .from("supplier_titulares")
        .select("id, supplier_workspace_id")
        .eq("id", titular_id)
        .eq("supplier_workspace_id", validation.supplier_workspace_id)
        .single();

      if (titError || !titular) {
        return new Response(
          JSON.stringify({ error: "Titular não encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (nome && typeof nome === "string") {
        const trimmed = nome.trim();
        if (trimmed.length < 2 || trimmed.length > 200) throw new Error("Nome inválido");
        updates.nome = trimmed;
      }
      if (email !== undefined) updates.email = email?.trim() || null;
      if (telefone !== undefined) updates.telefone = telefone?.trim() || null;
      if (observacoes !== undefined) updates.observacoes = observacoes?.trim() || null;
      if (data_inicio_parceria !== undefined) updates.data_inicio_parceria = data_inicio_parceria || null;
      if (data_fim_parceria !== undefined) updates.data_fim_parceria = data_fim_parceria || null;
      // Note: CPF (documento) is intentionally NOT updatable

      const { error: updateError } = await supabaseAdmin
        .from("supplier_titulares")
        .update(updates)
        .eq("id", titular_id);

      if (updateError) {
        console.error("update-titular error:", updateError);
        return new Response(
          JSON.stringify({ error: "Erro ao atualizar titular" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "generate") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const jwtToken = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(jwtToken);
      if (claimsError || !claimsData?.claims) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const userId = claimsData.claims.sub as string;
      const { supplier_profile_id, supplier_workspace_id, ttl_hours, label, max_uses } = await req.json();

      if (!supplier_profile_id || !supplier_workspace_id) {
        return new Response(
          JSON.stringify({ error: "supplier_profile_id e supplier_workspace_id são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const randomBytes = new Uint8Array(36);
      crypto.getRandomValues(randomBytes);
      const rawToken = base64Encode(randomBytes)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "")
        .slice(0, 48);

      const tokenHash = await hashToken(rawToken);
      const expiresAt = new Date(Date.now() + (ttl_hours || 72) * 60 * 60 * 1000).toISOString();

      const { error: insertError } = await supabaseAdmin.from("supplier_access_tokens").insert({
        token_hash: tokenHash,
        supplier_workspace_id,
        supplier_profile_id,
        created_by: userId,
        label: label || null,
        expires_at: expiresAt,
        max_uses: max_uses || null,
      });

      if (insertError) {
        console.error("Insert error:", insertError);
        return new Response(
          JSON.stringify({ error: "Erro ao gerar token" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          token: rawToken,
          expires_at: expiresAt,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── get-titular-history: fetch transactions for a titular's linked parceiro ──
    if (action === "get-titular-history") {
      const { token, titular_id } = await req.json();
      if (!token || !titular_id) {
        return new Response(JSON.stringify({ error: "Dados inválidos" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const tokenHash = await hashToken(token);
      const { data: validation, error: valError } = await supabaseAdmin.rpc("validate_supplier_token", { p_token_hash: tokenHash });
      if (valError || !validation?.valid) {
        return new Response(JSON.stringify({ error: "Token inválido" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Verify titular belongs to workspace
      const { data: titular } = await supabaseAdmin
        .from("supplier_titulares")
        .select("id, nome")
        .eq("id", titular_id)
        .eq("supplier_workspace_id", validation.supplier_workspace_id)
        .single();
      if (!titular) {
        return new Response(JSON.stringify({ error: "Titular não encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Find linked parceiro
      const { data: parceiro } = await supabaseAdmin
        .from("parceiros")
        .select("id, nome")
        .eq("supplier_titular_id", titular_id)
        .maybeSingle();

      if (!parceiro) {
        return new Response(JSON.stringify({ transactions: [], bancos: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Fetch transactions (last 200)
      const { data: transactions } = await supabaseAdmin
        .from("cash_ledger")
        .select("id, tipo_transacao, data_transacao, valor, moeda, status, descricao, created_at, destino_tipo, origem_tipo")
        .or(`origem_parceiro_id.eq.${parceiro.id},destino_parceiro_id.eq.${parceiro.id}`)
        .eq("workspace_id", validation.supplier_workspace_id)
        .order("data_transacao", { ascending: false })
        .limit(200);

      // Fetch contas bancarias
      const { data: contasBancarias } = await supabaseAdmin
        .from("contas_bancarias")
        .select("id, banco, agencia, conta, tipo_conta, titular, pix_key, moeda")
        .eq("parceiro_id", parceiro.id);

      return new Response(JSON.stringify({
        parceiro_id: parceiro.id,
        parceiro_nome: parceiro.nome,
        transactions: transactions || [],
        contas_bancarias: contasBancarias || [],
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── CRUD for supplier_titular_bancos ──
    if (action === "manage-banco") {
      const { token, titular_id, operation, banco_id, banco_nome, agencia, conta, tipo_conta, pix_key, pix_tipo, titular_conta, observacoes } = await req.json();
      if (!token || !titular_id || !operation) {
        return new Response(JSON.stringify({ error: "Dados inválidos" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const tokenHash = await hashToken(token);
      const { data: validation, error: valError } = await supabaseAdmin.rpc("validate_supplier_token", { p_token_hash: tokenHash });
      if (valError || !validation?.valid) {
        return new Response(JSON.stringify({ error: "Token inválido" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Verify titular belongs to workspace
      const { data: titular } = await supabaseAdmin
        .from("supplier_titulares")
        .select("id")
        .eq("id", titular_id)
        .eq("supplier_workspace_id", validation.supplier_workspace_id)
        .single();
      if (!titular) {
        return new Response(JSON.stringify({ error: "Titular não encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (operation === "list") {
        const { data: bancos } = await supabaseAdmin
          .from("supplier_titular_bancos")
          .select("*")
          .eq("titular_id", titular_id)
          .eq("supplier_workspace_id", validation.supplier_workspace_id)
          .order("created_at", { ascending: false });
        return new Response(JSON.stringify({ bancos: bancos || [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (operation === "create") {
        if (!banco_nome) {
          return new Response(JSON.stringify({ error: "Nome do banco é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const { error: insertErr } = await supabaseAdmin.from("supplier_titular_bancos").insert({
          titular_id,
          supplier_workspace_id: validation.supplier_workspace_id,
          banco_nome: banco_nome.trim(),
          agencia: agencia?.trim() || null,
          conta: conta?.trim() || null,
          tipo_conta: tipo_conta || "corrente",
          pix_key: pix_key?.trim() || null,
          pix_tipo: pix_tipo?.trim() || null,
          titular_conta: titular_conta?.trim() || null,
          observacoes: observacoes?.trim() || null,
        });
        if (insertErr) {
          console.error("create-banco error:", insertErr);
          return new Response(JSON.stringify({ error: "Erro ao criar banco" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (operation === "update") {
        if (!banco_id) {
          return new Response(JSON.stringify({ error: "banco_id obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (banco_nome !== undefined) updates.banco_nome = banco_nome?.trim() || null;
        if (agencia !== undefined) updates.agencia = agencia?.trim() || null;
        if (conta !== undefined) updates.conta = conta?.trim() || null;
        if (tipo_conta !== undefined) updates.tipo_conta = tipo_conta;
        if (pix_key !== undefined) updates.pix_key = pix_key?.trim() || null;
        if (pix_tipo !== undefined) updates.pix_tipo = pix_tipo?.trim() || null;
        if (titular_conta !== undefined) updates.titular_conta = titular_conta?.trim() || null;
        if (observacoes !== undefined) updates.observacoes = observacoes?.trim() || null;

        const { error: updateErr } = await supabaseAdmin
          .from("supplier_titular_bancos")
          .update(updates)
          .eq("id", banco_id)
          .eq("titular_id", titular_id);
        if (updateErr) {
          console.error("update-banco error:", updateErr);
          return new Response(JSON.stringify({ error: "Erro ao atualizar banco" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (operation === "delete") {
        if (!banco_id) {
          return new Response(JSON.stringify({ error: "banco_id obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const { error: delErr } = await supabaseAdmin
          .from("supplier_titular_bancos")
          .delete()
          .eq("id", banco_id)
          .eq("titular_id", titular_id);
        if (delErr) {
          return new Response(JSON.stringify({ error: "Erro ao excluir banco" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ error: "Operação inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── List ALL banks for a workspace (for transaction dialog) ──
    if (action === "list-workspace-bancos") {
      const { token } = await req.json();
      if (!token) {
        return new Response(JSON.stringify({ error: "Token obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const tokenHash = await hashToken(token);
      const { data: validation, error: valError } = await supabaseAdmin.rpc("validate_supplier_token", { p_token_hash: tokenHash });
      if (valError || !validation?.valid) {
        return new Response(JSON.stringify({ error: "Token inválido" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: bancos } = await supabaseAdmin
        .from("supplier_titular_bancos")
        .select("id, banco_nome, pix_key, saldo, titular_id, supplier_titulares(nome)")
        .eq("supplier_workspace_id", validation.supplier_workspace_id)
        .order("banco_nome");

      return new Response(JSON.stringify({ bancos: bancos || [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Update bank saldo (debit/credit on transactions) ──
    if (action === "update-banco-saldo") {
      const { token, banco_id, valor, operacao } = await req.json();
      if (!token || !banco_id || !valor || !operacao) {
        return new Response(JSON.stringify({ error: "Dados incompletos" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const tokenHash = await hashToken(token);
      const { data: validation, error: valError } = await supabaseAdmin.rpc("validate_supplier_token", { p_token_hash: tokenHash });
      if (valError || !validation?.valid) {
        return new Response(JSON.stringify({ error: "Token inválido" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Verify bank belongs to workspace
      const { data: banco } = await supabaseAdmin
        .from("supplier_titular_bancos")
        .select("id, saldo")
        .eq("id", banco_id)
        .eq("supplier_workspace_id", validation.supplier_workspace_id)
        .single();
      if (!banco) {
        return new Response(JSON.stringify({ error: "Banco não encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const numValor = Number(valor);
      let novoSaldo: number;
      if (operacao === "CREDIT") {
        novoSaldo = Number(banco.saldo) + numValor;
      } else if (operacao === "DEBIT") {
        novoSaldo = Number(banco.saldo) - numValor;
        if (novoSaldo < 0) {
          return new Response(JSON.stringify({ error: `Saldo insuficiente no banco. Disponível: R$ ${Number(banco.saldo).toFixed(2)}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } else {
        return new Response(JSON.stringify({ error: "Operação inválida (CREDIT ou DEBIT)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { error: updateErr } = await supabaseAdmin
        .from("supplier_titular_bancos")
        .update({ saldo: novoSaldo, updated_at: new Date().toISOString() })
        .eq("id", banco_id);
      if (updateErr) {
        return new Response(JSON.stringify({ error: "Erro ao atualizar saldo do banco" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ success: true, saldo_anterior: Number(banco.saldo), saldo_novo: novoSaldo }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(
      JSON.stringify({ error: "Ação não reconhecida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Supplier auth error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
