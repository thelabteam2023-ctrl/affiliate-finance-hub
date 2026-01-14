import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface UseImagePasteOptions {
  userId: string;
  onImageUploaded: (imageUrl: string) => void;
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
}

/**
 * Hook para lidar com paste de imagens em textarea/input
 * Faz upload para o storage e retorna a URL
 */
export function useImagePaste({
  userId,
  onImageUploaded,
  onUploadStart,
  onUploadEnd,
}: UseImagePasteOptions) {
  
  const handlePaste = useCallback(async (event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    // Procurar por imagem no clipboard
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        event.preventDefault();
        
        const file = item.getAsFile();
        if (!file) continue;

        try {
          onUploadStart?.();

          // Gerar nome único para o arquivo
          const timestamp = Date.now();
          const extension = file.type.split("/")[1] || "png";
          const fileName = `${userId}/${timestamp}.${extension}`;

          // Upload para o storage
          const { error: uploadError } = await supabase.storage
            .from("anotacoes-images")
            .upload(fileName, file, {
              cacheControl: "3600",
              upsert: false,
            });

          if (uploadError) {
            throw uploadError;
          }

          // Gerar URL pública
          const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/anotacoes-images/${fileName}`;
          
          onImageUploaded(imageUrl);
        } catch (error) {
          console.error("Erro ao fazer upload da imagem:", error);
          toast.error("Erro ao colar imagem");
        } finally {
          onUploadEnd?.();
        }

        return; // Processar apenas a primeira imagem
      }
    }
  }, [userId, onImageUploaded, onUploadStart, onUploadEnd]);

  return { handlePaste };
}
