import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

/**
 * Hook para buscar mapa de logos de bookmakers do catálogo
 * Retorna um Map<nome_normalizado, logo_url> para matching inteligente
 */
export function useBookmakerLogoMap() {
  const { data: catalogoData, isLoading } = useQuery({
    queryKey: ["bookmakers-catalogo-logos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookmakers_catalogo")
        .select("nome, logo_url")
        .not("logo_url", "is", null);
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 30, // 30 minutos - logos não mudam frequentemente
    gcTime: 1000 * 60 * 60, // 1 hora
  });

  const logoMap = useMemo(() => {
    const map = new Map<string, string | null>();
    
    if (!catalogoData) return map;
    
    catalogoData.forEach((item) => {
      if (item.logo_url && item.nome) {
        // Normalizar nome: UPPER CASE, sem acentos, sem caracteres especiais
        const normalizedName = item.nome
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim();
        
        if (!map.has(normalizedName)) {
          map.set(normalizedName, item.logo_url);
        }
      }
    });
    
    return map;
  }, [catalogoData]);

  /**
   * Busca o logo de uma bookmaker pelo nome
   * Faz matching inteligente: exato, case-insensitive, parcial
   */
  const getLogoUrl = (casaName: string): string | null => {
    if (!casaName || logoMap.size === 0) return null;
    
    // Normalizar input
    const normalizedInput = casaName
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9\s]/g, "")
      .trim();
    
    // 1. Match exato normalizado
    if (logoMap.has(normalizedInput)) {
      return logoMap.get(normalizedInput) ?? null;
    }
    
    // 2. Match sem espaços e caracteres especiais
    const simplifiedInput = normalizedInput.replace(/\s+/g, "");
    for (const [key, value] of logoMap.entries()) {
      const simplifiedKey = key.replace(/\s+/g, "");
      if (simplifiedKey === simplifiedInput) {
        return value ?? null;
      }
    }
    
    // 3. Match parcial (um contém o outro)
    for (const [key, value] of logoMap.entries()) {
      const simplifiedKey = key.replace(/\s+/g, "");
      if (simplifiedInput.includes(simplifiedKey) || simplifiedKey.includes(simplifiedInput)) {
        return value ?? null;
      }
    }
    
    // 4. Match por palavras principais (primeira palavra significativa)
    const inputFirstWord = normalizedInput.split(/\s+/)[0];
    if (inputFirstWord && inputFirstWord.length >= 3) {
      for (const [key, value] of logoMap.entries()) {
        const keyFirstWord = key.split(/\s+/)[0];
        if (keyFirstWord === inputFirstWord) {
          return value ?? null;
        }
      }
    }
    
    return null;
  };

  return {
    logoMap,
    getLogoUrl,
    isLoading,
  };
}
