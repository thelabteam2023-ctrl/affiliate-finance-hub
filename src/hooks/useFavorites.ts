import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Favorite {
  id: string;
  page_path: string;
  page_title: string;
  page_icon: string;
  created_at: string;
}

const MAX_FAVORITES = 3;

export function useFavorites() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);

  // Load favorites on mount and when user changes
  const loadFavorites = useCallback(async () => {
    if (!user) {
      setFavorites([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_favorites')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setFavorites(data || []);
    } catch (error) {
      console.error("Error loading favorites:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  // Check if a page is favorited
  const isFavorite = useCallback((pagePath: string): boolean => {
    return favorites.some(f => f.page_path === pagePath);
  }, [favorites]);

  // Add a favorite
  const addFavorite = useCallback(async (pagePath: string, pageTitle: string, pageIcon: string): Promise<boolean> => {
    if (!user) return false;

    // Check if already at max
    if (favorites.length >= MAX_FAVORITES) {
      return false;
    }

    // Check if already favorited
    if (isFavorite(pagePath)) {
      return true;
    }

    try {
      const { data, error } = await supabase
        .from('user_favorites')
        .insert({
          user_id: user.id,
          page_path: pagePath,
          page_title: pageTitle,
          page_icon: pageIcon,
        })
        .select()
        .single();

      if (error) throw error;

      setFavorites(prev => [...prev, data]);
      return true;
    } catch (error: any) {
      console.error("Error adding favorite:", error);
      return false;
    }
  }, [user, favorites.length, isFavorite]);

  // Remove a favorite
  const removeFavorite = useCallback(async (pagePath: string): Promise<boolean> => {
    if (!user) return false;

    const favorite = favorites.find(f => f.page_path === pagePath);
    if (!favorite) return true;

    try {
      const { error } = await supabase
        .from('user_favorites')
        .delete()
        .eq('id', favorite.id);

      if (error) throw error;

      setFavorites(prev => prev.filter(f => f.id !== favorite.id));
      return true;
    } catch (error) {
      console.error("Error removing favorite:", error);
      return false;
    }
  }, [user, favorites]);

  // Toggle favorite
  const toggleFavorite = useCallback(async (pagePath: string, pageTitle: string, pageIcon: string): Promise<boolean> => {
    if (isFavorite(pagePath)) {
      return removeFavorite(pagePath);
    } else {
      return addFavorite(pagePath, pageTitle, pageIcon);
    }
  }, [isFavorite, removeFavorite, addFavorite]);

  // Check if can add more favorites
  const canAddMore = favorites.length < MAX_FAVORITES;

  return {
    favorites,
    loading,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    canAddMore,
    maxFavorites: MAX_FAVORITES,
    refresh: loadFavorites,
  };
}
