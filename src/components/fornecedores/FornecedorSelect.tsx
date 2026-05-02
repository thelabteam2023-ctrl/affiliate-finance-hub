 import { useState, useEffect, forwardRef, useImperativeHandle, useRef } from "react";
 import { supabase } from "@/integrations/supabase/client";
 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from "@/components/ui/select";
 import { Input } from "@/components/ui/input";
 import { Search, Building2 } from "lucide-react";
 
 interface FornecedorSelectProps {
   value: string;
   onValueChange: (value: string) => void;
   disabled?: boolean;
   placeholder?: string;
 }
 
 export interface FornecedorSelectRef {
   focus: () => void;
   open: () => void;
 }
 
 interface Fornecedor {
   id: string;
   nome: string;
   documento?: string | null;
   status: string;
 }
 
 const FornecedorSelect = forwardRef<FornecedorSelectRef, FornecedorSelectProps>(({ 
   value, 
   onValueChange, 
   disabled,
   placeholder = "Selecione um fornecedor"
 }, ref) => {
   const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
   const [loading, setLoading] = useState(true);
   const [searchTerm, setSearchTerm] = useState("");
   const [displayName, setDisplayName] = useState<string>("");
   const triggerRef = useRef<HTMLButtonElement>(null);
 
   useImperativeHandle(ref, () => ({
     focus: () => {
       triggerRef.current?.focus();
     },
     open: () => {
       triggerRef.current?.focus();
       triggerRef.current?.click();
     },
   }));
 
   useEffect(() => {
     const fetchFornecedores = async () => {
       try {
         const { data, error } = await supabase
           .from("fornecedores")
           .select("id, nome, documento, status")
           .eq("status", "ativo")
           .order("nome", { ascending: true });
 
         if (error) throw error;
         setFornecedores(data || []);
       } catch (error) {
         console.error("Erro ao buscar fornecedores:", error);
       } finally {
         setLoading(false);
       }
     };
 
     fetchFornecedores();
   }, []);
 
   useEffect(() => {
     if (!value) {
       setDisplayName("");
       return;
     }
 
     const found = fornecedores.find(f => f.id === value);
     if (found) {
       setDisplayName(found.nome);
       return;
     }
 
     const fetchDisplayName = async () => {
       try {
         const { data } = await supabase
           .from("fornecedores")
           .select("nome")
           .eq("id", value)
           .maybeSingle();
         
         if (data) {
           setDisplayName(data.nome);
         }
       } catch (error) {
         console.error("Erro ao buscar nome do fornecedor:", error);
       }
     };
 
     fetchDisplayName();
   }, [value, fornecedores]);
 
   const filteredFornecedores = fornecedores.filter((fornecedor) =>
     fornecedor.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
     (fornecedor.documento && fornecedor.documento.includes(searchTerm))
   );
 
   return (
     <Select value={value} onValueChange={onValueChange} disabled={disabled || loading}>
       <SelectTrigger ref={triggerRef} className="w-full text-center">
         <div className="flex items-center justify-center gap-2 w-full">
           <Building2 className="h-4 w-4 flex-shrink-0" />
           <span className="truncate text-center">
             {displayName || (loading ? "Carregando..." : placeholder)}
           </span>
         </div>
       </SelectTrigger>
       <SelectContent>
         <div className="p-2 border-b" onKeyDown={(e) => e.stopPropagation()}>
           <div className="relative">
             <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
             <Input
               placeholder="Buscar fornecedor..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               onKeyDown={(e) => e.stopPropagation()}
               className="pl-8"
             />
           </div>
         </div>
         <div className="max-h-[300px] overflow-auto">
           {filteredFornecedores.length === 0 ? (
             <div className="p-4 text-center text-sm text-muted-foreground">
               {searchTerm ? "Nenhum fornecedor encontrado" : "Nenhum fornecedor ativo disponível"}
             </div>
           ) : (
             filteredFornecedores.map((fornecedor) => (
               <SelectItem key={fornecedor.id} value={fornecedor.id} className="text-left justify-start">
                 <div className="flex flex-col w-full py-0.5">
                   <div className="flex items-center gap-2">
                     <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                     <span className="font-medium">{fornecedor.nome}</span>
                   </div>
                   {fornecedor.documento && (
                     <span className="text-xs text-muted-foreground ml-6">
                       {fornecedor.documento}
                     </span>
                   )}
                 </div>
               </SelectItem>
             ))
           )}
         </div>
       </SelectContent>
     </Select>
   );
 });
 
 FornecedorSelect.displayName = "FornecedorSelect";
 
 export default FornecedorSelect;