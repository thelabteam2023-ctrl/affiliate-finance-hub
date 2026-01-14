import { useCallback, useState, type ClipboardEvent, type DragEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UseImageUploadOptions {
  userId: string;
  bucket?: string;
  onImageUploaded: (imageUrl: string) => void;
}

interface UseImageUploadReturn {
  isUploading: boolean;
  uploadImage: (file: File) => Promise<string | null>;
  handlePaste: (event: ClipboardEvent) => Promise<void>;
  handleDrop: (event: DragEvent) => Promise<void>;
  handleDragOver: (event: DragEvent) => void;
}

/**
 * Hook para upload de imagens para o Storage
 * Suporta: colar (Ctrl+V), arrastar e soltar
 */
export function useImageUpload({
  userId,
  bucket = "anotacoes-images",
  onImageUploaded,
}: UseImageUploadOptions): UseImageUploadReturn {
  const [isUploading, setIsUploading] = useState(false);

  const uploadImage = useCallback(
    async (file: File): Promise<string | null> => {
      if (!userId) {
        toast.error("Faça login para enviar imagens");
        return null;
      }

      if (!file.type.startsWith("image/")) {
        toast.error("Apenas imagens são permitidas");
        return null;
      }

      setIsUploading(true);

      try {
        const timestamp = Date.now();
        const extension = file.type.split("/")[1] || "png";
        const fileName = `${userId}/${timestamp}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(fileName, file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);

        return data.publicUrl;
      } catch (error) {
        console.error("Erro ao fazer upload da imagem:", error);
        toast.error("Erro ao enviar imagem");
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [userId, bucket]
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
          return;
        }
      }
    },
    [uploadImage, onImageUploaded]
  );

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
  }, []);

  const handleDrop = useCallback(
    async (event: DragEvent) => {
      const files = event.dataTransfer?.files;
      if (!files?.length) return;

      const firstImage = Array.from(files).find((f) =>
        f.type.startsWith("image/")
      );
      if (!firstImage) return;

      event.preventDefault();

      const imageUrl = await uploadImage(firstImage);
      if (imageUrl) onImageUploaded(imageUrl);
    },
    [uploadImage, onImageUploaded]
  );

  return {
    isUploading,
    uploadImage,
    handlePaste,
    handleDrop,
    handleDragOver,
  };
}
