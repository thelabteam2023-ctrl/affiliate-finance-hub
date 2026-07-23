import { useEffect, useRef } from "react";
import { useMarkAnnouncementRead } from "@/hooks/useAnnouncements";

/**
 * Marca um comunicado como lido quando o elemento fica
 * >= `dwellMs` visível em >= 60% no viewport. Dispara apenas 1x.
 */
export function useMarkAsReadOnView<T extends HTMLElement>(
  announcementId: string,
  isRead: boolean,
  { dwellMs = 1500, threshold = 0.6 }: { dwellMs?: number; threshold?: number } = {},
) {
  const ref = useRef<T | null>(null);
  const mark = useMarkAnnouncementRead();
  const firedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isRead || firedRef.current) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e) return;
        if (e.isIntersecting && e.intersectionRatio >= threshold) {
          if (timerRef.current) return;
          timerRef.current = setTimeout(() => {
            if (firedRef.current) return;
            firedRef.current = true;
            mark.mutate(announcementId);
          }, dwellMs);
        } else if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      },
      { threshold: [threshold] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [announcementId, isRead, dwellMs, threshold, mark]);

  return ref;
}