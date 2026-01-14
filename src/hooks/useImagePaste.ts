import { useCallback, type ClipboardEvent, type DragEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UseImagePasteOptions {
  userId: string;
  onImageUploaded: (imageUrl: string) => void;
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
}

/**
 * Hook para lidar com colar/arrastar imagens em textarea/input
 * Faz upload para o storage e retorna a URL pública
 */
export function useImagePaste({
  userId,
  onImageUploaded,
  onUploadStart,
  onUploadEnd,
}: UseImagePasteOptions) {
  const uploadImage = useCallback(
    async (file: File) => {
      if (!userId) {
        toast.error("Faça login para enviar imagens");
        return null;
      }

      onUploadStart?.();

      try {
        const timestamp = Date.now();
        const extension = file.type.split("/")[1] || "png";
        const fileName = `${userId}/${timestamp}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from("anotacoes-images")
          .upload(fileName, file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from("anotacoes-images")
          .getPublicUrl(fileName);

        return data.publicUrl;
      } catch (error) {
        console.error("Erro ao fazer upload da imagem:", error);
        toast.error("Erro ao enviar imagem");
        return null;
      } finally {
        onUploadEnd?.();
      }
    },
    [userId, onUploadStart, onUploadEnd]
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          event.preventDefault();

          const file = item.getAsFile();
          if (!file) return;

          const imageUrl = await uploadImage(file);
          if (imageUrl) onImageUploaded(imageUrl);
          return; // Processar apenas a primeira imagem
        }
      }
    },
    [onImageUploaded, uploadImage]
  );

  const handleDragOver = useCallback((event: DragEvent) => {
    // Permitir drop
    event.preventDefault();
  }, []);

  const handleDrop = useCallback(
    async (event: DragEvent) => {
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const firstImage = Array.from(files).find((f) => f.type.startsWith("image/"));
      if (!firstImage) return;

      event.preventDefault();

      const imageUrl = await uploadImage(firstImage);
      if (imageUrl) onImageUploaded(imageUrl);
    },
    [onImageUploaded, uploadImage]
  );

  return { handlePaste, handleDrop, handleDragOver };
}

