import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withMiddleware, corsHeaders, type AuthResult } from "../_shared/middleware.ts";

Deno.serve(async (req) => {
  return withMiddleware(req, 'snapshot-capital-diario', async (auth, req) => {
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
    const todayStr = spFormatter.format(now);

    // Get all active workspaces
    const { data: workspaces, error: wsError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("is_active", true);

    if (wsError) throw wsError;

    const results: string[] = [];

    for (const ws of workspaces || []) {
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
  }, { allowCron: true, skipRateLimitForCron: true });
});
