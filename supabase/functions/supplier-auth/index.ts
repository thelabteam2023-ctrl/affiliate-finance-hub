import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { encode as base64Encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-workspace-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // ─── VALIDATE TOKEN ───
    if (action === "validate") {
      const { token } = await req.json();
      if (!token || typeof token !== "string" || token.length < 32) {
        return new Response(
          JSON.stringify({ valid: false, error: "Token inválido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Hash the token for lookup
      const encoder = new TextEncoder();
      const data = encoder.encode(token);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const tokenHash = base64Encode(new Uint8Array(hashBuffer));

      // Validate via RPC
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

    // ─── GENERATE TOKEN (requires auth) ───
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

      // Generate secure random token (48 chars)
      const randomBytes = new Uint8Array(36);
      crypto.getRandomValues(randomBytes);
      const rawToken = base64Encode(randomBytes)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "")
        .slice(0, 48);

      // Hash for storage
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawToken));
      const tokenHash = base64Encode(new Uint8Array(hashBuffer));

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
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
