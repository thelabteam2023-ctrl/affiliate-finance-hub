import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withMiddleware, corsHeaders, type AuthResult } from "../_shared/middleware.ts";

Deno.serve(async (req) => {
  return withMiddleware(req, 'sync-bookmaker-logos', async (auth, req) => {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parâmetros opcionais: limit e offset para processar em lotes
    let limit = 20;
    let offset = 0;
    try {
      const body = await req.json();
      if (body.limit) limit = Math.min(body.limit, 50);
      if (body.offset) offset = body.offset;
    } catch {
      // sem body, usa defaults
    }

    // Buscar bookmakers com logo_url externa (não do nosso storage)
    const { data: bookmakers, error: fetchError } = await supabase
      .from("bookmakers_catalogo")
      .select("id, nome, logo_url")
      .not("logo_url", "is", null)
      .not("logo_url", "ilike", `%${supabaseUrl}%`)
      .range(offset, offset + limit - 1);

    if (fetchError) throw fetchError;

    const bucket = "bookmaker-logos";
    const results: { nome: string; status: string; newUrl?: string; error?: string }[] = [];

    for (const bk of bookmakers || []) {
      const logoUrl = bk.logo_url as string;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(logoUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          results.push({ nome: bk.nome, status: "fetch_failed", error: `HTTP ${response.status}` });
          continue;
        }

        const contentType = response.headers.get("content-type") || "image/png";
        const imageData = await response.arrayBuffer();

        let ext = "png";
        if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpg";
        else if (contentType.includes("svg")) ext = "svg";
        else if (contentType.includes("webp")) ext = "webp";
        else if (contentType.includes("gif")) ext = "gif";

        const safeName = bk.nome
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");

        const filePath = `${safeName}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(filePath, imageData, { contentType, upsert: true });

        if (uploadError) {
          results.push({ nome: bk.nome, status: "upload_failed", error: uploadError.message });
          continue;
        }

        const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
        const newUrl = publicUrlData.publicUrl;

        const { error: updateError } = await supabase
          .from("bookmakers_catalogo")
          .update({ logo_url: newUrl })
          .eq("id", bk.id);

        if (updateError) {
          results.push({ nome: bk.nome, status: "update_failed", error: updateError.message });
          continue;
        }

        results.push({ nome: bk.nome, status: "synced", newUrl });
      } catch (err) {
        results.push({
          nome: bk.nome,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const synced = results.filter((r) => r.status === "synced").length;
    const failed = results.filter((r) => r.status !== "synced").length;
    const hasMore = (bookmakers || []).length === limit;

    return new Response(
      JSON.stringify({
        summary: { total: results.length, synced, failed, offset, limit, hasMore, nextOffset: hasMore ? offset + limit : null },
        details: results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }, { allowCron: true, skipRateLimitForCron: true });
});
