import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- AUTH CHECK: Require authenticated user (JWT) ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    console.warn("AUTH_DENIED", { reason: "missing_header", fn: "snapshot-capital-diario" });
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) {
    console.warn("AUTH_DENIED", { reason: "invalid_token", fn: "snapshot-capital-diario" });
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get today's date in São Paulo timezone
    const now = new Date();
    const spFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayStr = spFormatter.format(now); // yyyy-MM-dd

    // Get all active workspaces
    const { data: workspaces, error: wsError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("is_active", true);

    if (wsError) throw wsError;

    const results: string[] = [];

    for (const ws of workspaces || []) {
      // Get bookmaker balances for this workspace
      const { data: bookmakers, error: bkError } = await supabase
        .from("bookmakers")
        .select("saldo_atual, moeda")
        .eq("workspace_id", ws.id)
        .in("status", ["ativo", "ATIVO", "EM_USO", "limitada", "LIMITADA", "AGUARDANDO_SAQUE"]);

      if (bkError) {
        console.error(`Error fetching bookmakers for workspace ${ws.id}:`, bkError);
        continue;
      }

      let capitalBRL = 0;
      let capitalUSD = 0;
      let capitalEUR = 0;

      for (const bk of bookmakers || []) {
        const saldo = bk.saldo_atual || 0;
        const moeda = (bk.moeda || "BRL").toUpperCase();
        if (moeda === "USD" || moeda === "USDT") capitalUSD += saldo;
        else if (moeda === "EUR") capitalEUR += saldo;
        else capitalBRL += saldo;
      }

      // Fetch current USD rate from get-exchange-rates or use default
      let cotacaoUSD = 5.0;
      let cotacaoEUR = 5.5;
      try {
        const ratesResp = await fetch(`${supabaseUrl}/functions/v1/get-exchange-rates`, {
          headers: { Authorization: `Bearer ${supabaseServiceKey}` },
        });
        if (ratesResp.ok) {
          const ratesData = await ratesResp.json();
          if (ratesData?.rates?.USD) cotacaoUSD = 1 / ratesData.rates.USD;
          if (ratesData?.rates?.EUR) cotacaoEUR = 1 / ratesData.rates.EUR;
        }
      } catch {
        // Use defaults
      }

      const totalBRL = capitalBRL + capitalUSD * cotacaoUSD + capitalEUR * cotacaoEUR;

      // Get volume apostado for today
      const { data: volumeData } = await supabase
        .from("apostas_unificada")
        .select("stake_consolidado")
        .eq("workspace_id", ws.id)
        .eq("status", "LIQUIDADA")
        .gte("data_aposta", todayStr)
        .lte("data_aposta", todayStr);

      const volumeHoje = (volumeData || []).reduce(
        (sum: number, a: any) => sum + (a.stake_consolidado || 0),
        0
      );

      // Upsert snapshot (idempotent for the day)
      const { error: upsertError } = await supabase.from("capital_snapshots").upsert(
        {
          workspace_id: ws.id,
          snapshot_date: todayStr,
          capital_bookmakers_brl: capitalBRL,
          capital_bookmakers_usd: capitalUSD,
          capital_bookmakers_eur: capitalEUR,
          capital_bookmakers_total_brl: totalBRL,
          cotacao_usd: cotacaoUSD,
          cotacao_eur: cotacaoEUR,
          volume_apostado_periodo: volumeHoje,
        },
        { onConflict: "workspace_id,snapshot_date" }
      );

      if (upsertError) {
        console.error(`Error upserting snapshot for workspace ${ws.id}:`, upsertError);
      } else {
        results.push(`${ws.id}: BRL=${totalBRL.toFixed(2)}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, snapshots: results.length, details: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Snapshot error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
