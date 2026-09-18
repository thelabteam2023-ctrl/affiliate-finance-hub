import { corsHeaders } from '../_shared/middleware.ts';
import { requireSystemOwner, serviceClient } from '../_shared/systemOwner.ts';

interface TableInfo {
  table_name: string;
  pk_column: string | null;
  sort_order: number;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const auth = await requireSystemOwner(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  const admin = serviceClient();

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  const action = String(body.action ?? '');

  try {
    // ----- Estado atual, para comparação antes de restaurar -----
    if (action === 'preview') {
      const { data: tables, error } = await admin.rpc('admin_backup_tables');
      if (error) throw error;
      const list = (tables ?? []) as TableInfo[];

      const atuais: Record<string, number> = {};
      for (const t of list) {
        const { data: count, error: cErr } = await admin.rpc('admin_table_row_count', { _table: t.table_name });
        if (cErr) throw cErr;
        atuais[t.table_name] = Number(count ?? 0);
      }

      const { data: buckets } = await admin.storage.listBuckets();
      const bucketsAtuais: Record<string, number> = {};
      for (const b of buckets ?? []) {
        const { data: objs } = await admin.storage.from(b.name).list('', { limit: 1 });
        bucketsAtuais[b.name] = objs ? 1 : 0; // presença; contagem detalhada não é necessária aqui
      }

      return json({
        ordem: list.map((t) => ({ nome: t.table_name, ordem: t.sort_order })),
        linhasAtuais: atuais,
        buckets: (buckets ?? []).map((b) => b.name),
        bucketsAtuais,
      });
    }

    // ----- Espelhamento: limpa as tabelas em ordem inversa de dependência -----
    if (action === 'clear') {
      const alvo: string[] = Array.isArray(body.tabelas) ? body.tabelas : [];
      const { data: tables, error } = await admin.rpc('admin_backup_tables');
      if (error) throw error;
      const list = (tables ?? []) as TableInfo[];

      const ordered = list
        .filter((t) => alvo.includes(t.table_name))
        .sort((a, b) => b.sort_order - a.sort_order);

      let removidas = 0;
      const erros: Array<{ tabela: string; erro: string }> = [];
      for (const t of ordered) {
        const { data, error: dErr } = await admin.rpc('admin_restore_clear', { _table: t.table_name });
        if (dErr) erros.push({ tabela: t.table_name, erro: dErr.message });
        else removidas += Number(data ?? 0);
      }
      return json({ removidas, erros });
    }

    // ----- Carga de linhas -----
    if (action === 'insert') {
      const tabela = String(body.tabela ?? '');
      const linhas = Array.isArray(body.linhas) ? body.linhas : [];
      if (!tabela) return json({ error: 'Tabela não informada.' }, 400);
      if (linhas.length === 0) return json({ inseridas: 0 });

      const { data, error } = await admin.rpc('admin_restore_insert', { _table: tabela, _rows: linhas });
      if (error) return json({ inseridas: 0, erro: error.message }, 200);
      return json({ inseridas: Number(data ?? 0) });
    }

    // ----- Arquivos do Storage -----
    if (action === 'storage') {
      const bucket = String(body.bucket ?? '');
      const publico = Boolean(body.publico);
      const arquivos: Array<{ path: string; base64: string; contentType?: string }> = body.arquivos ?? [];
      if (!bucket) return json({ error: 'Bucket não informado.' }, 400);

      const { data: existentes } = await admin.storage.listBuckets();
      if (!(existentes ?? []).some((b) => b.name === bucket)) {
        await admin.storage.createBucket(bucket, { public: publico });
      }

      let enviados = 0;
      const erros: Array<{ path: string; erro: string }> = [];
      for (const f of arquivos) {
        const bytes = b64ToBytes(f.base64);
        const { error } = await admin.storage.from(bucket).upload(f.path, bytes, {
          upsert: true,
          contentType: f.contentType || 'application/octet-stream',
        });
        if (error) erros.push({ path: f.path, erro: error.message });
        else enviados++;
      }
      return json({ enviados, erros });
    }

    // ----- Espelhamento do Storage: remove o que não está no pacote -----
    if (action === 'storage_prune') {
      const bucket = String(body.bucket ?? '');
      const manter: string[] = Array.isArray(body.manter) ? body.manter : [];
      if (!bucket) return json({ error: 'Bucket não informado.' }, 400);
      const keep = new Set(manter);

      const remover: string[] = [];
      const walk = async (prefix: string): Promise<void> => {
        let offset = 0;
        for (;;) {
          const { data, error } = await admin.storage
            .from(bucket)
            .list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
          if (error) throw error;
          const entries = data ?? [];
          for (const entry of entries) {
            const path = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (!entry.id) await walk(path);
            else if (!keep.has(path)) remover.push(path);
          }
          if (entries.length < 1000) break;
          offset += 1000;
        }
      };
      await walk('');

      for (let i = 0; i < remover.length; i += 100) {
        await admin.storage.from(bucket).remove(remover.slice(i, i + 100));
      }
      return json({ removidos: remover.length });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (e) {
    console.error('system-restore falhou:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
