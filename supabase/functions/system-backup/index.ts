import { corsHeaders } from '../_shared/middleware.ts';
import { requireSystemOwner, serviceClient } from '../_shared/systemOwner.ts';

/**
 * Backup em partes: o navegador orquestra as chamadas e monta o pacote .zip.
 * A service_role nunca sai do servidor; cada chamada faz um pedaço pequeno do
 * trabalho para respeitar os limites de tempo/CPU das funções.
 */

const PAGE_SIZE = 1000;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const auth = await requireSystemOwner(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  const admin = serviceClient();

  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    /* corpo opcional */
  }
  const action = String(body.action ?? 'plan');

  try {
    // ---------- Lista de tabelas e buckets ----------
    if (action === 'plan') {
      const { data: tables, error } = await admin.rpc('admin_backup_tables');
      if (error) throw error;
      const { data: buckets, error: bErr } = await admin.storage.listBuckets();
      if (bErr) throw bErr;
      return json({
        gerado_por: auth.email ?? auth.userId,
        tabelas: tables ?? [],
        buckets: (buckets ?? []).map((b) => ({ nome: b.name, publico: Boolean(b.public) })),
      });
    }

    // ---------- Um bloco de linhas de uma tabela ----------
    if (action === 'table') {
      const tabela = String(body.tabela ?? '');
      const offset = Number(body.offset ?? 0);
      const pk = body.pk ? String(body.pk) : null;
      if (!tabela) return json({ error: 'Tabela não informada.' }, 400);

      let q = admin.from(tabela).select('*').range(offset, offset + PAGE_SIZE - 1);
      if (pk) q = q.order(pk, { ascending: true });
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 200);
      const linhas = data ?? [];
      return json({ linhas, fim: linhas.length < PAGE_SIZE });
    }

    // ---------- Usuários (sem senhas) ----------
    if (action === 'users') {
      const page = Number(body.page ?? 1);
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const users = (data?.users ?? []).map((u) => ({
        id: u.id,
        email: u.email,
        phone: u.phone,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at,
        user_metadata: u.user_metadata,
        app_metadata: u.app_metadata,
      }));
      return json({ users, fim: users.length < 1000 });
    }

    // ---------- Estrutura do banco ----------
    if (action === 'schema') {
      const { data, error } = await admin.rpc('admin_dump_schema');
      if (error) throw error;
      return json({ sql: String(data ?? '') });
    }

    // ---------- Lista recursiva de arquivos de um bucket ----------
    if (action === 'storage_list') {
      const bucket = String(body.bucket ?? '');
      if (!bucket) return json({ error: 'Bucket não informado.' }, 400);

      const paths: Array<{ path: string; size: number }> = [];
      const walk = async (prefix: string): Promise<void> => {
        let offset = 0;
        for (;;) {
          const { data, error } = await admin.storage
            .from(bucket)
            .list(prefix, { limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } });
          if (error) throw error;
          const entries = data ?? [];
          for (const entry of entries) {
            const path = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (!entry.id) await walk(path);
            else paths.push({ path, size: Number((entry as any).metadata?.size ?? 0) });
          }
          if (entries.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
        }
      };
      await walk('');
      return json({ arquivos: paths });
    }

    // ---------- Links temporários para baixar os arquivos ----------
    if (action === 'storage_urls') {
      const bucket = String(body.bucket ?? '');
      const paths: string[] = Array.isArray(body.paths) ? body.paths : [];
      if (!bucket) return json({ error: 'Bucket não informado.' }, 400);
      if (!paths.length) return json({ urls: [] });

      const { data, error } = await admin.storage.from(bucket).createSignedUrls(paths, 3600);
      if (error) throw error;
      return json({
        urls: (data ?? []).map((u) => ({ path: u.path, url: u.signedUrl, erro: u.error })),
      });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (e) {
    console.error('system-backup falhou:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
