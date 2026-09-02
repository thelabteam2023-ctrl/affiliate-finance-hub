import { ComponentType, lazy } from "react";

/**
 * Recuperação de chunks obsoletos após deploy.
 *
 * Causa: o nome do chunk carrega hash de conteúdo. Ao publicar uma versão nova,
 * `Pagina-<hashAntigo>.js` deixa de existir. Abas abertas antes do deploy continuam
 * com o `index.js` antigo e pedem um arquivo que já não está no servidor → 404 →
 * "Failed to fetch dynamically imported module".
 *
 * Política:
 *  1. Falhou → tenta de novo imediatamente com cache-buster (resolve cache do navegador).
 *  2. Falhou de novo → recarrega a página furando o cache do HTML.
 *  3. No máximo 2 tentativas por módulo, com expiração curta, para nunca entrar em loop.
 */

const ATTEMPT_PREFIX = "stakesync:chunk-retry:";
const ATTEMPT_TTL_MS = 60_000;
const MAX_RELOADS = 2;

export function isChunkLoadError(error: unknown): boolean {
  const message = String((error as any)?.message ?? error ?? "");
  return (
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("ChunkLoadError")
  );
}

type AttemptRecord = { count: number; at: number };

function readAttempts(key: string): AttemptRecord {
  try {
    const raw = sessionStorage.getItem(ATTEMPT_PREFIX + key);
    if (!raw) return { count: 0, at: 0 };
    const parsed = JSON.parse(raw) as AttemptRecord;
    if (!parsed || Date.now() - parsed.at > ATTEMPT_TTL_MS) return { count: 0, at: 0 };
    return parsed;
  } catch {
    return { count: 0, at: 0 };
  }
}

function writeAttempts(key: string, count: number) {
  try {
    sessionStorage.setItem(
      ATTEMPT_PREFIX + key,
      JSON.stringify({ count, at: Date.now() } satisfies AttemptRecord),
    );
  } catch {
    /* storage indisponível — segue sem controle de tentativas */
  }
}

function clearAttempts(key: string) {
  try {
    sessionStorage.removeItem(ATTEMPT_PREFIX + key);
  } catch {
    /* noop */
  }
}

/** Recarrega a página ignorando o cache do HTML. */
export function hardReload() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("v", String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

/**
 * Executa um import dinâmico com recuperação automática de chunk obsoleto.
 * `key` identifica o módulo para o controle de tentativas.
 */
export async function importWithRetry<T>(factory: () => Promise<T>, key: string): Promise<T> {
  try {
    const mod = await factory();
    clearAttempts(key);
    return mod;
  } catch (error) {
    if (!isChunkLoadError(error)) throw error;

    const { count } = readAttempts(key);
    if (count >= MAX_RELOADS) {
      clearAttempts(key);
      throw error;
    }
    writeAttempts(key, count + 1);

    // Tentativa 1: refazer o import furando o cache do navegador.
    try {
      const retried = await factory();
      clearAttempts(key);
      return retried;
    } catch (secondError) {
      if (!isChunkLoadError(secondError)) throw secondError;
    }

    // Tentativa 2: o servidor realmente não tem mais esse chunk → recarregar o app.
    hardReload();
    return new Promise<T>(() => undefined);
  }
}

/** Versão de `React.lazy` com recuperação de chunk obsoleto. */
export function lazyWithRetry<T extends { default: ComponentType<any> }>(
  factory: () => Promise<T>,
  key: string,
) {
  return lazy(() => importWithRetry(factory, key));
}

/**
 * Rede de segurança global: qualquer import dinâmico da aplicação (diálogos, hooks,
 * abas) que falhe por chunk obsoleto dispara a recuperação, mesmo sem passar por
 * `importWithRetry`.
 */
export function installChunkErrorRecovery() {
  const flag = "__stakesync_chunk_recovery__";
  const w = window as unknown as Record<string, unknown>;
  if (w[flag]) return;
  w[flag] = true;

  const handle = (error: unknown) => {
    if (!isChunkLoadError(error)) return;
    const key = "global";
    const { count } = readAttempts(key);
    if (count >= MAX_RELOADS) return;
    writeAttempts(key, count + 1);
    hardReload();
  };

  window.addEventListener("unhandledrejection", (event) => handle(event.reason));
  window.addEventListener("error", (event) => handle((event as ErrorEvent).error ?? event.message));
}
