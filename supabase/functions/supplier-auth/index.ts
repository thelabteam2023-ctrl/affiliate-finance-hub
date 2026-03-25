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
