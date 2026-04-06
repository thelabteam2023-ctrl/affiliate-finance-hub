import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Auth: accept cron secret or service role key
  const cronSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const isAuthorized =
    cronSecret === serviceRoleKey ||
    cronSecret === anonKey ||
    authHeader === `Bearer ${serviceRoleKey}`;

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fetch completed, non-archived solicitacoes
  const { data: items, error: fetchError } = await supabase
    .from("solicitacoes")
    .select("id, created_at, concluida_at")
    .eq("status", "concluida")
    .is("archived_at", null)
    .not("concluida_at", "is", null);

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  const TEN_MIN = 10 * 60 * 1000;
  const ONE_HOUR = 60 * 60 * 1000;

  const toArchive: string[] = [];

  for (const item of items ?? []) {
    const created = new Date(item.created_at).getTime();
    const completed = new Date(item.concluida_at).getTime();
    const resolutionMs = completed - created;

    let retentionMs: number;
    if (resolutionMs <= TEN_MIN) retentionMs = 6 * ONE_HOUR;
    else if (resolutionMs <= ONE_HOUR) retentionMs = 12 * ONE_HOUR;
    else retentionMs = 24 * ONE_HOUR;

    if (now >= completed + retentionMs) {
      toArchive.push(item.id);
    }
  }

  let archived = 0;
  if (toArchive.length > 0) {
    const { error: updateError, count } = await supabase
      .from("solicitacoes")
      .update({ archived_at: new Date().toISOString() })
      .in("id", toArchive);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    archived = count ?? toArchive.length;
  }

  return new Response(
    JSON.stringify({
      checked: items?.length ?? 0,
      archived,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
