import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EPSILON = 0.01;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Varre todas as bookmakers ativas
    const { data: bookmakers, error: bkErr } = await admin
      .from("bookmakers")
      .select("id, workspace_id, nome, saldo_atual")
      .eq("status", "ATIVA");

    if (bkErr) {
      console.error("[cron-sweep] erro lendo bookmakers", bkErr);
      return json({ error: bkErr.message }, 500);
    }

    const dia = new Date().toISOString().slice(0, 10);
    const contexto = "cron diário";
    let scanned = 0;
    let divergent = 0;
    const errors: any[] = [];

    for (const bk of bookmakers ?? []) {
      scanned++;
      // Soma o ledger (valor já é assinado: créditos + / débitos -)
      const { data: ledger, error: ledErr } = await admin
        .from("cash_ledger")
        .select("valor")
        .eq("bookmaker_id", bk.id);
      if (ledErr) {
        errors.push({ bookmaker_id: bk.id, err: ledErr.message });
        continue;
      }
      const somaLedger = (ledger ?? []).reduce((s, r: any) => s + Number(r.valor ?? 0), 0);
      const saldo = Number(bk.saldo_atual ?? 0);
      const delta = Number((saldo - somaLedger).toFixed(4));

      if (Math.abs(delta) <= EPSILON) continue;
      divergent++;

      // Upsert idempotente
      const { data: existing } = await admin
        .from("ledger_parity_anomalies")
        .select("id, acknowledged_at")
        .eq("bookmaker_id", bk.id)
        .eq("dia", dia)
        .eq("contexto", contexto)
        .maybeSingle();

      if (existing) {
        await admin
          .from("ledger_parity_anomalies")
          .update({ saldo_atual: saldo, soma_ledger: somaLedger, delta })
          .eq("id", existing.id);
      } else {
        await admin.from("ledger_parity_anomalies").insert({
          workspace_id: bk.workspace_id,
          bookmaker_id: bk.id,
          saldo_atual: saldo,
          soma_ledger: somaLedger,
          delta,
          contexto,
          dia,
        });
      }
    }

    return json({ ok: true, scanned, divergent, errors });
  } catch (err) {
    console.error("[cron-sweep]", err);
    return json({ error: String(err) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}