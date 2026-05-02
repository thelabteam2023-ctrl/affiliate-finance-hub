 import { useState, useEffect } from "react";
 import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
 import { Button } from "@/components/ui/button";
 import { TagInput } from "@/components/ui/tag-input";
 import { supabase } from "@/integrations/supabase/client";
 import { toast } from "sonner";
 import { Tag as TagIcon, Loader2 } from "lucide-react";
 import { useWorkspace } from "@/hooks/useWorkspace";
 
 interface EditarTagsDialogProps {
   transacao: any | null;
   open: boolean;
   onClose: () => void;
   onSuccess: () => void;
 }
 
 export function EditarTagsDialog({ transacao, open, onClose, onSuccess }: EditarTagsDialogProps) {
   const { workspaceId } = useWorkspace();
   const [tags, setTags] = useState<string[]>([]);
   const [loading, setLoading] = useState(false);
   const [suggestions, setSuggestions] = useState<string[]>([]);
 
   useEffect(() => {
     if (open && transacao) {
       setTags(transacao.tags || []);
     }
   }, [open, transacao]);
 
   useEffect(() => {
     const fetchSuggestions = async () => {
       if (!open || !workspaceId) return;
       const { data, error } = await supabase.rpc('get_cash_ledger_tags', { p_workspace_id: workspaceId });
       if (!error && data) {
         setSuggestions(data);
       }
     };
     fetchSuggestions();
   }, [open, workspaceId]);
 
   const handleSave = async () => {
     if (!transacao) return;
     setLoading(true);
     try {
       const { error } = await supabase
         .from("cash_ledger")
         .update({ tags })
         .eq("id", transacao.id);
 
       if (error) throw error;
 
       toast.success("Tags atualizadas com sucesso!");
       onSuccess();
       onClose();
     } catch (error: any) {
       console.error("Erro ao atualizar tags:", error);
       toast.error("Erro ao atualizar tags: " + error.message);
     } finally {
       setLoading(false);
     }
   };
 
   return (
     <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
       <DialogContent className="sm:max-w-[425px]">
         <DialogHeader>
           <DialogTitle className="flex items-center gap-2">
             <TagIcon className="h-5 w-5 text-primary" />
             Editar Tags
           </DialogTitle>
         </DialogHeader>
         <div className="py-4 space-y-4">
           <div className="space-y-2">
             <p className="text-sm text-muted-foreground">
               Categorize esta movimentação para facilitar a organização financeira.
             </p>
             <TagInput
               tags={tags}
               onChange={setTags}
               suggestions={suggestions}
               className="mt-2"
             />
           </div>
         </div>
         <DialogFooter>
           <Button variant="outline" onClick={onClose} disabled={loading}>
             Cancelar
           </Button>
           <Button onClick={handleSave} disabled={loading}>
             {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
             Salvar Alterações
           </Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>
   );
 }