import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  bookmaker_id: string;
  saldo_atual: number;
  soma_ledger: number;
  delta: number;
  contexto?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "missing authorization" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Cliente para validar o token do chamador
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "invalid token" }, 401);
    }
    const userId = userData.user.id;

    const body = (await req.json().catch(() => null)) as Payload | null;
    if (
      !body ||
      typeof body.bookmaker_id !== "string" ||
      typeof body.saldo_atual !== "number" ||
      typeof body.soma_ledger !== "number" ||
      typeof body.delta !== "number"
    ) {
      return json({ error: "invalid payload" }, 400);
    }

    // Service client: precisa buscar workspace_id da bookmaker e validar membership
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: bk, error: bkErr } = await admin
      .from("bookmakers")
      .select("id, workspace_id")
      .eq("id", body.bookmaker_id)
      .maybeSingle();

    if (bkErr || !bk) {
      return json({ error: "bookmaker not found" }, 404);
    }

    // Confirma que o usuário pertence ao workspace da bookmaker
    const { data: membership } = await admin
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", bk.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) {
      return json({ error: "not a member of workspace" }, 403);
    }

    const contexto = (body.contexto ?? "manual").slice(0, 200);
    const dia = new Date().toISOString().slice(0, 10);

    // Upsert idempotente por (bookmaker_id, dia, contexto)
    const { data: existing } = await admin
      .from("ledger_parity_anomalies")
      .select("id, delta")
      .eq("bookmaker_id", body.bookmaker_id)
      .eq("dia", dia)
      .eq("contexto", contexto)
      .maybeSingle();

    if (existing) {
      // Atualiza apenas se o delta mudou (mantém ack anterior se já reconhecido)
      const { error: updErr } = await admin
        .from("ledger_parity_anomalies")
        .update({
          saldo_atual: body.saldo_atual,
          soma_ledger: body.soma_ledger,
          delta: body.delta,
          detected_by_user_id: userId,
        })
        .eq("id", existing.id);
      if (updErr) return json({ error: updErr.message }, 500);
      return json({ ok: true, id: existing.id, action: "updated" });
    }

    const { data: inserted, error: insErr } = await admin
      .from("ledger_parity_anomalies")
      .insert({
        workspace_id: bk.workspace_id,
        bookmaker_id: body.bookmaker_id,
        saldo_atual: body.saldo_atual,
        soma_ledger: body.soma_ledger,
        delta: body.delta,
        contexto,
        detected_by_user_id: userId,
        dia,
      })
      .select("id")
      .single();

    if (insErr) return json({ error: insErr.message }, 500);
    return json({ ok: true, id: inserted.id, action: "inserted" });
  } catch (err) {
    console.error("[record-parity-anomaly]", err);
    return json({ error: String(err) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}