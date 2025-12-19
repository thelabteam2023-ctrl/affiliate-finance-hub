import { useState } from 'react';
import { MoreHorizontal, Trash2, Shield, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { useCommunityModeration } from '@/hooks/useCommunityModeration';

interface ModerationMenuProps {
  type: 'topic' | 'comment';
  itemId: string;
  itemTitle?: string;
  onDeleted?: () => void;
  size?: 'sm' | 'default';
}

export function ModerationMenu({ 
  type, 
  itemId, 
  itemTitle,
  onDeleted,
  size = 'default',
}: ModerationMenuProps) {
  const { canModerate, loading, deleteTopic, deleteComment } = useCommunityModeration();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (!canModerate) return null;

  const handleDelete = async () => {
    const result = type === 'topic'
      ? await deleteTopic(itemId, reason || undefined)
      : await deleteComment(itemId, reason || undefined);

    if (result.success) {
      setConfirmOpen(false);
      setReason('');
      onDeleted?.();
    }
  };

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const buttonSize = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`${buttonSize} text-muted-foreground hover:text-foreground`}
          >
            <MoreHorizontal className={iconSize} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <div className="px-2 py-1.5 text-xs text-muted-foreground flex items-center gap-1">
            <Shield className="h-3 w-3" />
            Moderação
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive cursor-pointer"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Excluir {type === 'topic' ? 'Tópico' : 'Comentário'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {type === 'topic' ? 'Tópico' : 'Comentário'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {itemTitle && (
                <span className="block font-medium text-foreground mb-2">
                  "{itemTitle}"
                </span>
              )}
              Esta ação irá remover o conteúdo. {type === 'topic' && 'Todos os comentários associados também serão removidos.'}
              <br /><br />
              O conteúdo será marcado como removido e ficará no log de moderação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <Input
              placeholder="Motivo da remoção (opcional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={loading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
