import { useCallback, useEffect, useState } from "react";
import type { FilterState, SavedView } from "./types";

function storageKey(cardId: string, userId: string | null) {
  return `central-ops:views:${cardId}:${userId || "anon"}`;
}

function load(cardId: string, userId: string | null): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(cardId, userId));
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
  } catch {
    return [];
  }
}

export function useSavedViews(cardId: string, userId: string | null) {
  const [views, setViews] = useState<SavedView[]>(() => load(cardId, userId));

  useEffect(() => {
    setViews(load(cardId, userId));
  }, [cardId, userId]);

  const persist = useCallback(
    (next: SavedView[]) => {
      try {
        localStorage.setItem(storageKey(cardId, userId), JSON.stringify(next));
      } catch {
        /* noop */
      }
      setViews(next);
    },
    [cardId, userId],
  );

  const saveView = useCallback(
    (name: string, state: FilterState) => {
      const view: SavedView = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        state,
        createdAt: new Date().toISOString(),
      };
      persist([view, ...views]);
      return view;
    },
    [views, persist],
  );

  const deleteView = useCallback(
    (id: string) => persist(views.filter((v) => v.id !== id)),
    [views, persist],
  );

  const renameView = useCallback(
    (id: string, name: string) =>
      persist(views.map((v) => (v.id === id ? { ...v, name } : v))),
    [views, persist],
  );

  return { views, saveView, deleteView, renameView };
}