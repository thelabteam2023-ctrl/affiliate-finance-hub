 import * as React from "react";
 import { X } from "lucide-react";
 import { Badge } from "./badge";
 import { cn } from "@/lib/utils";
 
 interface TagInputProps {
   placeholder?: string;
   tags: string[];
   onChange: (tags: string[]) => void;
   className?: string;
   suggestions?: string[];
 }
 
 export function TagInput({
   placeholder,
   tags,
   onChange,
   className,
   suggestions = [],
 }: TagInputProps) {
   const [inputValue, setInputValue] = React.useState("");
 
   const addTag = (tag: string) => {
     const trimmedTag = tag.trim();
     if (trimmedTag && !tags.includes(trimmedTag)) {
       onChange([...tags, trimmedTag]);
     }
     setInputValue("");
   };
 
   const removeTag = (tagToRemove: string) => {
     onChange(tags.filter((tag) => tag !== tagToRemove));
   };
 
   const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
     if (e.key === "Enter" || e.key === ",") {
       e.preventDefault();
       addTag(inputValue);
     } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
       removeTag(tags[tags.length - 1]);
     }
   };
 
   const filteredSuggestions = suggestions.filter(
     (suggestion) => 
       suggestion.toLowerCase().includes(inputValue.toLowerCase()) && 
       !tags.includes(suggestion)
   );
 
   return (
     <div className={cn("space-y-2", className)}>
       <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
         {tags.map((tag) => (
           <Badge key={tag} variant="secondary" className="flex items-center gap-1 py-1 px-2 text-xs">
             {tag}
             <button
               type="button"
               onClick={() => removeTag(tag)}
               className="hover:text-destructive focus:outline-none"
             >
               <X className="h-3 w-3" />
             </button>
           </Badge>
         ))}
         <input
           className="flex-1 bg-transparent outline-none text-sm min-w-[120px]"
           placeholder={tags.length === 0 ? placeholder : ""}
           value={inputValue}
           onChange={(e) => setInputValue(e.target.value)}
           onKeyDown={handleKeyDown}
           onBlur={() => inputValue && addTag(inputValue)}
         />
       </div>
       
       {inputValue && filteredSuggestions.length > 0 && (
         <div className="flex flex-wrap gap-1 mt-1">
           {filteredSuggestions.map((suggestion) => (
             <button
               key={suggestion}
               type="button"
               onClick={() => addTag(suggestion)}
               className="text-[10px] px-2 py-1 rounded-full bg-muted hover:bg-muted-foreground/20 transition-colors"
             >
               {suggestion}
             </button>
           ))}
         </div>
       )}
     </div>
   );
 }