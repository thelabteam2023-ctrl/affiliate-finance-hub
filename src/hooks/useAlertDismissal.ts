import { useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useWorkspace } from "./useWorkspace";

/**
 * Preferência persistente de "não mostrar novamente" para avisos informativos.
 * Escopo: por usuário + chave do aviso (+ projeto, quando informado).
 * Não interfere em nenhum cálculo ou métrica — controla apenas exibição.
 */
export function useAlertDismissal(alertKey: string, projectId?: string) {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();

  const queryKey = ["alert-dismissal", user?.id ?? null, alertKey, projectId ?? null];

  const { data: isDismissed = false, isLoading } = useQuery({
    queryKey,
    enabled: !!user?.id && !!alertKey,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let query = supabase
        .from("user_alert_dismissals")
        .select("id")
        .eq("user_id", user!.id)
        .eq("alert_key", alertKey);

      query = projectId ? query.eq("project_id", projectId) : query.is("project_id", null);

      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !workspace?.id) throw new Error("Sessão ou workspace indisponível");
      const { error } = await supabase.from("user_alert_dismissals").insert({
        user_id: user.id,
        workspace_id: workspace.id,
        project_id: projectId ?? null,
        alert_key: alertKey,
      });
      // Conflito = já estava dispensado; tratar como sucesso
      if (error && error.code !== "23505") throw error;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, true);
    },
    onError: () => {
      queryClient.setQueryData(queryKey, false);
    },
  });

  const dismiss = useCallback(() => {
    mutation.mutate();
  }, [mutation]);

  return {
    isDismissed,
    isLoading: isLoading && !!user?.id,
    dismiss,
  };
}
