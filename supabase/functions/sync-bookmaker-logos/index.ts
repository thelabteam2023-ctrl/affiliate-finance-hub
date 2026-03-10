import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Buscar todas as bookmakers do catálogo que têm logo_url externa
    const { data: bookmakers, error: fetchError } = await supabase
      .from("bookmakers_catalogo")
      .select("id, nome, logo_url")
      .not("logo_url", "is", null);

    if (fetchError) throw fetchError;

    const bucket = "bookmaker-logos";
    const results: { nome: string; status: string; newUrl?: string; error?: string }[] = [];

    for (const bk of bookmakers || []) {
      const logoUrl = bk.logo_url as string;

      // Skip se já é uma URL do nosso storage
      if (logoUrl.includes(supabaseUrl)) {
        results.push({ nome: bk.nome, status: "skipped", newUrl: logoUrl });
        continue;
      }

      try {
        // Baixar a imagem externa
        const response = await fetch(logoUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });

        if (!response.ok) {
          results.push({
            nome: bk.nome,
            status: "fetch_failed",
            error: `HTTP ${response.status}`,
          });
          continue;
        }

        const contentType = response.headers.get("content-type") || "image/png";
        const imageData = await response.arrayBuffer();

        // Determinar extensão
        let ext = "png";
        if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpg";
        else if (contentType.includes("svg")) ext = "svg";
        else if (contentType.includes("webp")) ext = "webp";
        else if (contentType.includes("gif")) ext = "gif";

        // Nome do arquivo normalizado
        const safeName = bk.nome
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");

        const filePath = `${safeName}.${ext}`;

        // Upload para o storage (upsert)
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(filePath, imageData, {
            contentType,
            upsert: true,
          });

        if (uploadError) {
          results.push({
            nome: bk.nome,
            status: "upload_failed",
            error: uploadError.message,
          });
          continue;
        }

        // Obter URL pública
        const { data: publicUrlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(filePath);

        const newUrl = publicUrlData.publicUrl;

        // Atualizar a tabela com a nova URL
        const { error: updateError } = await supabase
          .from("bookmakers_catalogo")
          .update({ logo_url: newUrl })
          .eq("id", bk.id);

        if (updateError) {
          results.push({
            nome: bk.nome,
            status: "update_failed",
            error: updateError.message,
          });
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
    const skipped = results.filter((r) => r.status === "skipped").length;
    const failed = results.filter((r) => !["synced", "skipped"].includes(r.status)).length;

    return new Response(
      JSON.stringify({
        summary: { total: results.length, synced, skipped, failed },
        details: results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
