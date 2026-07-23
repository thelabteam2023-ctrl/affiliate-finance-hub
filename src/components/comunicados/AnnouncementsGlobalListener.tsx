import { useAnnouncementsRealtime } from "@/hooks/useAnnouncementsRealtime";
import { AnnouncementAckModal } from "./AnnouncementAckModal";
import { useAuth } from "@/hooks/useAuth";

/**
 * Drivers globais do módulo Comunicados:
 * - Realtime subscription + toast coalescido (Alta/Normal/Baixa).
 * - Modal de acknowledge (Crítica).
 * Renderizar UMA vez dentro do layout autenticado.
 */
export function AnnouncementsGlobalListener() {
  const { user, workspaceId } = useAuth();
  useAnnouncementsRealtime();
  if (!user?.id || !workspaceId) return null;
  return <AnnouncementAckModal />;
}