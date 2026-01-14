import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface ImagePreviewDialogProps {
  imageUrl: string | null;
  alt?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImagePreviewDialog({
  imageUrl,
  alt = "Imagem",
  open,
  onOpenChange,
}: ImagePreviewDialogProps) {
  if (!imageUrl) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-2">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <img
          src={imageUrl}
          alt={alt}
          className="w-full h-auto max-h-[85vh] object-contain rounded-md"
        />
      </DialogContent>
    </Dialog>
  );
}
