import { corsHeaders } from '../_shared/middleware.ts';
import { requireSystemOwner, serviceClient } from '../_shared/systemOwner.ts';
import { Zip, ZipDeflate, ZipPassThrough } from 'https://esm.sh/fflate@0.8.2';

const PAGE_SIZE = 1000;
const LOG_TABLES = new Set([
  'api_request_logs',
  'debug_logs',
  'error_logs',
  'login_attempts',
  'login_history',
  'daily_events',
  'sports_events_raw',
  'financial_debug_log',
  'audit_logs',
]);

const enc = new TextEncoder();

interface TableInfo {
  table_name: string;
  pk_column: string | null;
  sort_order: number;
}

function addTextFile(zip: Zip, name: string, text: string) {
  const file = new ZipDeflate(name, { level: 6 });
  zip.add(file);
  file.push(enc.encode(text), true);
}

function addBinaryFile(zip: Zip, name: string, bytes: Uint8Array) {
  const file = new ZipPassThrough(name);
  zip.add(file);
  file.push(bytes, true);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const auth = await requireSystemOwner(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.message }), {
      status: auth.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let includeLogs = true;
  try {
    const body = await req.json();
    if (typeof body?.includeLogs === 'boolean') includeLogs = body.includeLogs;
  } catch {
    // corpo opcional
  }

  const admin = serviceClient();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const zip = new Zip();
      zip.ondata = (err, chunk, final) => {
        if (err) {
          try { controller.error(err); } catch { /* já fechado */ }
          return;
        }
        if (chunk && chunk.length) controller.enqueue(chunk);
        if (final) {
          try { controller.close(); } catch { /* já fechado */ }
        }
      };

      (async () => {
        const manifest = {
          gerado_em: new Date().toISOString(),
          gerado_por: auth.email ?? auth.userId,
          versao_pacote: 1,
          inclui_logs: includeLogs,
          tabelas: [] as Array<{ nome: string; linhas: number; ordem: number; pk: string | null }>,
          buckets: [] as Array<{ nome: string; publico: boolean; arquivos: number; bytes: number }>,
          usuarios: 0,
          totais: { tabelas: 0, linhas: 0, arquivos: 0 },
        };

        // ---------- 1. DADOS ----------
        const { data: tables, error: tblErr } = await admin.rpc('admin_backup_tables');
        if (tblErr) throw new Error(`Lista de tabelas: ${tblErr.message}`);

        const tableList = (tables ?? []) as TableInfo[];
        for (const t of tableList) {
          if (!includeLogs && LOG_TABLES.has(t.table_name)) continue;

          const file = new ZipDeflate(`dados/${t.table_name}.json`, { level: 6 });
          zip.add(file);
          file.push(enc.encode('[\n'), false);

          let offset = 0;
          let rows = 0;
          for (;;) {
            let q = admin.from(t.table_name).select('*').range(offset, offset + PAGE_SIZE - 1);
            if (t.pk_column) q = q.order(t.pk_column, { ascending: true });
            const { data, error } = await q;
            if (error) throw new Error(`Tabela ${t.table_name}: ${error.message}`);
            const batch = data ?? [];
            for (const row of batch) {
              file.push(enc.encode((rows > 0 ? ',\n' : '') + JSON.stringify(row)), false);
              rows++;
            }
            if (batch.length < PAGE_SIZE) break;
            offset += PAGE_SIZE;
          }

          file.push(enc.encode('\n]\n'), true);
          manifest.tabelas.push({ nome: t.table_name, linhas: rows, ordem: t.sort_order, pk: t.pk_column });
          manifest.totais.linhas += rows;
        }
        manifest.totais.tabelas = manifest.tabelas.length;

        // ---------- 1b. USUÁRIOS (sem senhas) ----------
        const users: Array<Record<string, unknown>> = [];
        for (let page = 1; page <= 100; page++) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (error) throw new Error(`Usuários: ${error.message}`);
          const batch = data?.users ?? [];
          for (const u of batch) {
            users.push({
              id: u.id,
              email: u.email,
              phone: u.phone,
              created_at: u.created_at,
              last_sign_in_at: u.last_sign_in_at,
              email_confirmed_at: u.email_confirmed_at,
              user_metadata: u.user_metadata,
              app_metadata: u.app_metadata,
            });
          }
          if (batch.length < 1000) break;
        }
        manifest.usuarios = users.length;
        addTextFile(zip, 'dados/_auth_users.json', JSON.stringify(users, null, 2));

        // ---------- 2. STORAGE ----------
        const { data: buckets, error: bktErr } = await admin.storage.listBuckets();
        if (bktErr) throw new Error(`Buckets: ${bktErr.message}`);

        for (const bucket of buckets ?? []) {
          let files = 0;
          let bytes = 0;

          const walk = async (prefix: string): Promise<void> => {
            let offset = 0;
            for (;;) {
              const { data, error } = await admin.storage
                .from(bucket.name)
                .list(prefix, { limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } });
              if (error) throw new Error(`Bucket ${bucket.name}: ${error.message}`);
              const entries = data ?? [];
              for (const entry of entries) {
                const path = prefix ? `${prefix}/${entry.name}` : entry.name;
                if (!entry.id) {
                  await walk(path);
                  continue;
                }
                const { data: blob, error: dlErr } = await admin.storage.from(bucket.name).download(path);
                if (dlErr || !blob) {
                  console.warn(`Falha ao baixar ${bucket.name}/${path}: ${dlErr?.message}`);
                  continue;
                }
                const bufferBytes = new Uint8Array(await blob.arrayBuffer());
                addBinaryFile(zip, `storage/${bucket.name}/${path}`, bufferBytes);
                files++;
                bytes += bufferBytes.length;
              }
              if (entries.length < PAGE_SIZE) break;
              offset += PAGE_SIZE;
            }
          };

          await walk('');
          manifest.buckets.push({
            nome: bucket.name,
            publico: Boolean(bucket.public),
            arquivos: files,
            bytes,
          });
          manifest.totais.arquivos += files;
        }

        // ---------- 3. ESTRUTURA ----------
        const { data: schemaSql, error: schemaErr } = await admin.rpc('admin_dump_schema');
        if (schemaErr) throw new Error(`Estrutura: ${schemaErr.message}`);
        addTextFile(zip, 'schema.sql', String(schemaSql ?? ''));

        // ---------- 4. MANIFEST ----------
        addTextFile(zip, 'MANIFEST.json', JSON.stringify(manifest, null, 2));

        zip.end();
      })().catch((e) => {
        console.error('system-backup falhou:', e);
        try { controller.error(e); } catch { /* já fechado */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="labbet-backup-${stamp}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
});
