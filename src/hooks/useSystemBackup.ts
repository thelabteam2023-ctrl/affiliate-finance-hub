import { useCallback, useState } from 'react';
import { unzip, type Unzipped } from 'fflate';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const INSERT_CHUNK = 400;
const UPLOAD_CHUNK_BYTES = 3 * 1024 * 1024;

export interface BackupManifest {
  gerado_em: string;
  gerado_por?: string;
  versao_pacote: number;
  inclui_logs: boolean;
  tabelas: Array<{ nome: string; linhas: number; ordem: number; pk: string | null }>;
  buckets: Array<{ nome: string; publico: boolean; arquivos: number; bytes: number }>;
  usuarios: number;
  totais: { tabelas: number; linhas: number; arquivos: number };
}

export interface PacoteLido {
  manifest: BackupManifest;
  dados: Record<string, any[]>;
  storage: Record<string, Array<{ path: string; bytes: Uint8Array }>>;
  usuarios: Array<Record<string, any>>;
  temSchema: boolean;
}

export interface RestoreResumo {
  tabelas: number;
  linhas: number;
  arquivos: number;
  removidas: number;
  erros: Array<{ contexto: string; erro: string }>;
  usuariosAusentes: Array<{ id: string; email: string | null }>;
}

export type Etapa = 'idle' | 'dados' | 'fotos' | 'finalizando' | 'concluido' | 'erro';

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', svg: 'image/svg+xml', pdf: 'application/pdf',
  mp3: 'audio/mpeg', mp4: 'video/mp4', webm: 'video/webm', json: 'application/json',
  txt: 'text/plain', csv: 'text/csv',
};

function contentTypeFor(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME[ext] ?? 'application/octet-stream';
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(bin);
}

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Entre novamente.');
  return {
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    'Content-Type': 'application/json',
  };
}

async function callRestore(payload: Record<string, unknown>) {
  const res = await fetch(`${FUNCTIONS_BASE}/system-restore`, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Falha na restauração (${res.status})`);
  return body;
}

export function useSystemBackup() {
  const [etapa, setEtapa] = useState<Etapa>('idle');
  const [progresso, setProgresso] = useState(0);
  const [detalhe, setDetalhe] = useState<string>('');
  const [resumo, setResumo] = useState<RestoreResumo | null>(null);
  const [backupResumo, setBackupResumo] = useState<{ tamanho: number; arquivo: string } | null>(null);

  // ---------------- BACKUP ----------------
  const gerarBackup = useCallback(async (incluirLogs: boolean) => {
    setEtapa('dados');
    setProgresso(10);
    setDetalhe('Exportando dados das tabelas...');
    setBackupResumo(null);

    try {
      const res = await fetch(`${FUNCTIONS_BASE}/system-backup`, {
        method: 'POST',
        headers: await authHeader(),
        body: JSON.stringify({ includeLogs: incluirLogs }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Falha ao gerar backup (${res.status})`);
      }

      setEtapa('fotos');
      setProgresso(55);
      setDetalhe('Baixando fotos e arquivos...');

      const blob = await res.blob();

      setEtapa('finalizando');
      setProgresso(90);
      setDetalhe('Finalizando pacote...');

      const nome = `labbet-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setBackupResumo({ tamanho: blob.size, arquivo: nome });
      setProgresso(100);
      setEtapa('concluido');
      setDetalhe('Backup concluído.');
      toast.success('Backup gerado com sucesso');
    } catch (e: any) {
      setEtapa('erro');
      setDetalhe(e?.message ?? 'Erro desconhecido');
      toast.error(e?.message ?? 'Erro ao gerar backup');
    }
  }, []);

  // ---------------- LEITURA DO PACOTE ----------------
  const lerPacote = useCallback(async (file: File): Promise<PacoteLido> => {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const entries: Unzipped = await new Promise((resolve, reject) => {
      unzip(buffer, (err, data) => (err ? reject(err) : resolve(data)));
    });

    const decoder = new TextDecoder();
    const manifestRaw = entries['MANIFEST.json'];
    if (!manifestRaw) throw new Error('Pacote inválido: MANIFEST.json não encontrado.');
    const manifest = JSON.parse(decoder.decode(manifestRaw)) as BackupManifest;

    const dados: Record<string, any[]> = {};
    const storage: Record<string, Array<{ path: string; bytes: Uint8Array }>> = {};
    let usuarios: Array<Record<string, any>> = [];

    for (const [name, bytes] of Object.entries(entries)) {
      if (!bytes || name.endsWith('/')) continue;
      if (name === 'dados/_auth_users.json') {
        usuarios = JSON.parse(decoder.decode(bytes));
      } else if (name.startsWith('dados/') && name.endsWith('.json')) {
        const tabela = name.slice('dados/'.length, -'.json'.length);
        dados[tabela] = JSON.parse(decoder.decode(bytes));
      } else if (name.startsWith('storage/')) {
        const rest = name.slice('storage/'.length);
        const idx = rest.indexOf('/');
        if (idx <= 0) continue;
        const bucket = rest.slice(0, idx);
        const path = rest.slice(idx + 1);
        (storage[bucket] ??= []).push({ path, bytes });
      }
    }

    return { manifest, dados, storage, usuarios, temSchema: Boolean(entries['schema.sql']) };
  }, []);

  const carregarEstadoAtual = useCallback(async () => {
    return await callRestore({ action: 'preview' });
  }, []);

  // ---------------- RESTAURAÇÃO ----------------
  const restaurar = useCallback(async (pacote: PacoteLido) => {
    setEtapa('dados');
    setProgresso(0);
    setResumo(null);
    const erros: Array<{ contexto: string; erro: string }> = [];

    try {
      const tabelas = Object.keys(pacote.dados);

      setDetalhe('Limpando tabelas para espelhar o pacote...');
      const clear = await callRestore({ action: 'clear', tabelas });
      for (const e of clear.erros ?? []) erros.push({ contexto: `limpeza ${e.tabela}`, erro: e.erro });

      const ordem = (pacote.manifest.tabelas ?? [])
        .slice()
        .sort((a, b) => a.ordem - b.ordem)
        .map((t) => t.nome)
        .filter((n) => tabelas.includes(n));
      const restantes = tabelas.filter((t) => !ordem.includes(t));
      const sequencia = [...ordem, ...restantes];

      let linhasGravadas = 0;
      for (let i = 0; i < sequencia.length; i++) {
        const tabela = sequencia[i];
        const linhas = pacote.dados[tabela] ?? [];
        setDetalhe(`Restaurando dados: ${tabela} (${i + 1}/${sequencia.length})`);
        setProgresso(Math.round(((i + 1) / sequencia.length) * 70));

        for (let j = 0; j < linhas.length; j += INSERT_CHUNK) {
          const chunk = linhas.slice(j, j + INSERT_CHUNK);
          const res = await callRestore({ action: 'insert', tabela, linhas: chunk });
          if (res.erro) erros.push({ contexto: `tabela ${tabela}`, erro: res.erro });
          linhasGravadas += Number(res.inseridas ?? 0);
        }
      }

      // ---------- Arquivos ----------
      setEtapa('fotos');
      setDetalhe('Reenviando fotos e arquivos...');
      let arquivosEnviados = 0;
      const buckets = Object.keys(pacote.storage);
      for (let b = 0; b < buckets.length; b++) {
        const bucket = buckets[b];
        const arquivos = pacote.storage[bucket];
        const publico = pacote.manifest.buckets?.find((x) => x.nome === bucket)?.publico ?? false;

        let lote: Array<{ path: string; base64: string; contentType: string }> = [];
        let loteBytes = 0;
        const enviarLote = async () => {
          if (!lote.length) return;
          const res = await callRestore({ action: 'storage', bucket, publico, arquivos: lote });
          for (const e of res.erros ?? []) erros.push({ contexto: `${bucket}/${e.path}`, erro: e.erro });
          arquivosEnviados += Number(res.enviados ?? 0);
          lote = [];
          loteBytes = 0;
        };

        for (const f of arquivos) {
          lote.push({ path: f.path, base64: bytesToBase64(f.bytes), contentType: contentTypeFor(f.path) });
          loteBytes += f.bytes.length;
          if (loteBytes >= UPLOAD_CHUNK_BYTES) await enviarLote();
        }
        await enviarLote();

        await callRestore({ action: 'storage_prune', bucket, manter: arquivos.map((f) => f.path) });
        setProgresso(70 + Math.round(((b + 1) / buckets.length) * 25));
      }

      // ---------- Usuários ----------
      setEtapa('finalizando');
      setDetalhe('Conferindo usuários...');
      const perfis = pacote.dados['profiles'] ?? [];
      const idsPerfis = new Set(perfis.map((p: any) => p.id));
      const usuariosAusentes = (pacote.usuarios ?? [])
        .filter((u: any) => !idsPerfis.has(u.id))
        .map((u: any) => ({ id: u.id, email: u.email ?? null }));

      const resultado: RestoreResumo = {
        tabelas: sequencia.length,
        linhas: linhasGravadas,
        arquivos: arquivosEnviados,
        removidas: Number(clear.removidas ?? 0),
        erros,
        usuariosAusentes,
      };
      setResumo(resultado);
      setProgresso(100);
      setEtapa('concluido');
      setDetalhe('Restauração concluída.');
      toast.success('Restauração concluída');
      return resultado;
    } catch (e: any) {
      setEtapa('erro');
      setDetalhe(e?.message ?? 'Erro desconhecido');
      toast.error(e?.message ?? 'Erro na restauração');
      throw e;
    }
  }, []);

  const reset = useCallback(() => {
    setEtapa('idle');
    setProgresso(0);
    setDetalhe('');
    setResumo(null);
    setBackupResumo(null);
  }, []);

  return { etapa, progresso, detalhe, resumo, backupResumo, gerarBackup, lerPacote, carregarEstadoAtual, restaurar, reset };
}
