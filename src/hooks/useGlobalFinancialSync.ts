import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { invalidateCanonicalCaches } from "@/lib/invalidateCanonicalCaches";
import { invalidateBalanceDependentQueries } from "@/lib/balanceQueryKeys";

/**
 * SINCRONIZAÇÃO GLOBAL DE ESTADO FINANCEIRO (montado UMA vez no App).
 *
 * PROBLEMA QUE RESOLVE:
 * A sincronização cross-window era opt-in por aba (useCrossWindowSync em
 * ProjetoApostasTab, BonusApostasTab, etc). Quando a edição/reliquidação
 * acontecia na janela popup (/janela/surebet/:id), apenas a aba que estivesse
 * montada e escutando invalidava o cache. KPIs de patrimônio
 * (projeto-financial-metrics), calculadoras e telas financeiras em outras
 * abas/janelas continuavam com dados antigos até um F5.
 *
 * ESTRATÉGIA (2 camadas, sem reload):
 * 1. Mensagens cross-window (BroadcastChannel + postMessage + localStorage):
 *    invalidação imediata dos caches canônicos do projeto afetado.
 * 2. Realtime do banco (bookmakers + financial_events do workspace):
 *    rede de segurança que cobre QUALQUER operação que altere saldo
 *    (aposta, liquidação, reliquidação, depósito, saque, transferência,
 *    ajuste de saldo, perda operacional) — inclusive as executadas em
 *    outra janela, outro dispositivo ou por outro usuário do workspace.
 */

const BET_CHANNELS = ["aposta_channel", "aposta_multipla_channel", "surebet_channel", "financial_state_channel"] as const;

const VALID_EVENTS = new Set([
  "APOSTA_SAVED",
  "APOSTA_DELETED",
  "resultado_updated",
  "APOSTA_MULTIPLA_SAVED",
  "SUREBET_SAVED",
  "FINANCIAL_STATE_CHANGED",
]);

const STORAGE_KEYS = new Set([
  "aposta_saved",
  "aposta_multipla_saved",
  "surebet_saved",
  "financial_state_changed",
]);

/** Debounce para agrupar rajadas de eventos (ex.: liquidação perna a perna) */
const DEBOUNCE_MS = 350;

export function useGlobalFinancialSync(): void {
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProjetosRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const flush = async () => {
      timerRef.current = null;
      const projetos = Array.from(pendingProjetosRef.current);
      pendingProjetosRef.current.clear();

      // 1. Saldos e KPIs de patrimônio (escopo global — cobre calculadoras)
      await invalidateBalanceDependentQueries(queryClient);

      // 2. Caches canônicos por projeto afetado (lucro, calendário, listagens)
      await Promise.all(projetos.map((p) => invalidateCanonicalCaches(queryClient, p)));
    };

    const schedule = (projetoId?: string | null) => {
      if (projetoId) pendingProjetosRef.current.add(projetoId);
      if (timerRef.current) return;
      timerRef.current = setTimeout(() => { void flush(); }, DEBOUNCE_MS);
    };

    // ---------- Camada 1: mensagens cross-window ----------
    const channels: BroadcastChannel[] = [];
    try {
      BET_CHANNELS.forEach((name) => {
        const bc = new BroadcastChannel(name);
        bc.onmessage = (event: MessageEvent) => {
          const { type, projetoId } = event.data || {};
          if (VALID_EVENTS.has(type)) schedule(projetoId);
        };
        channels.push(bc);
      });
    } catch {
      // BroadcastChannel indisponível — fallbacks abaixo cobrem
    }

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || !VALID_EVENTS.has(data.type)) return;
      schedule(data.projetoId);
    };

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || !STORAGE_KEYS.has(event.key) || !event.newValue) return;
      try {
        schedule(JSON.parse(event.newValue)?.projetoId);
      } catch {
        schedule(null);
      }
    };

    window.addEventListener("message", handleMessage);
    window.addEventListener("storage", handleStorage);

    // ---------- Camada 2: realtime do banco (rede de segurança) ----------
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    if (workspaceId) {
      realtimeChannel = supabase
        .channel(`global-financial-sync-${workspaceId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "bookmakers", filter: `workspace_id=eq.${workspaceId}` },
          (payload: any) => schedule(payload?.new?.projeto_id ?? null),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "financial_events", filter: `workspace_id=eq.${workspaceId}` },
          (payload: any) => schedule(payload?.new?.projeto_id ?? payload?.old?.projeto_id ?? null),
        )
        .subscribe();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      channels.forEach((bc) => { try { bc.close(); } catch { /* ignore */ } });
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorage);
      if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    };
  }, [queryClient, workspaceId]);
}

/**
 * Notifica TODAS as janelas/abas de que o estado financeiro mudou.
 * Usar após operações de Caixa (depósito, saque, transferência, ajuste)
 * que não emitem eventos de aposta.
 */
export function broadcastFinancialStateChange(projetoId?: string | null): void {
  const payload = { type: "FINANCIAL_STATE_CHANGED", projetoId: projetoId ?? null, timestamp: Date.now() };
  try {
    const bc = new BroadcastChannel("financial_state_channel");
    bc.postMessage(payload);
    bc.close();
  } catch { /* ignore */ }
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ ...payload, source: "financial_state" }, "*");
    }
  } catch { /* ignore */ }
  try {
    localStorage.setItem("financial_state_changed", JSON.stringify(payload));
    setTimeout(() => localStorage.removeItem("financial_state_changed"), 100);
  } catch { /* ignore */ }
}
