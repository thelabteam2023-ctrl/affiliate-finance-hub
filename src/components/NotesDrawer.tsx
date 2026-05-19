import React, { useState, useEffect, useRef } from 'react';
import { 
  NotebookPen, 
  X, 
  Plus, 
  Trash2, 
  ChevronRight,
  ChevronLeft,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNotesData } from '@/hooks/useNotesData';

interface NotesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotesDrawer: React.FC<NotesDrawerProps> = ({ isOpen, onClose }) => {
  const { 
    colunas, 
    cards, 
    loading, 
    handleCreateCard, 
    handleUpdateCard, 
    handleMoveCard, 
    handleDeleteCard,
    canOperate 
  } = useNotesData();

  const [view, setView] = useState<'geral' | 'fluxo'>('geral');
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const colunasFluxo = colunas.filter(c => c.nome !== 'Geral');
  const colunaGeral = colunas.find(c => c.nome === 'Geral');

  // Define active tab when columns are loaded
  useEffect(() => {
    if (colunasFluxo.length > 0 && !activeTabId) {
      setActiveTabId(colunasFluxo[0].id);
    }
  }, [colunasFluxo, activeTabId]);

  // If view is general, we use the general column ID for adding notes
  const currentActiveColumnId = view === 'geral' ? colunaGeral?.id : activeTabId;

  // Focus textarea when adding
  useEffect(() => {
    if (isAdding && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isAdding]);

  const addNote = async () => {
    if (!newNoteText.trim() || !currentActiveColumnId) {
      setIsAdding(false);
      return;
    }

    await handleCreateCard(currentActiveColumnId, newNoteText);
    setNewNoteText('');
    setIsAdding(false);
  };

  const getNextColumnId = (currentId: string) => {
    const currentIndex = colunas.findIndex(c => c.id === currentId);
    if (currentIndex !== -1 && currentIndex < colunas.length - 1) {
      return colunas[currentIndex + 1].id;
    }
    return null;
  };

  const getPrevColumnId = (currentId: string) => {
    const currentIndex = colunas.findIndex(c => c.id === currentId);
    if (currentIndex > 0) {
      return colunas[currentIndex - 1].id;
    }
    return null;
  };

  const activeColumn = colunas.find(c => c.id === activeTabId);
  const columnCards = cards.filter(c => c.coluna_id === activeTabId).sort((a, b) => a.ordem - b.ordem);

  return (
    <>
      {/* Overlay */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/50 z-[60] transition-opacity duration-300",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div 
        className={cn(
          "fixed top-0 right-0 h-full bg-[#13161c] z-[70] border-l border-[#2a2d35] transition-transform duration-300 ease-in-out shadow-2xl flex flex-col",
          "w-full sm:w-[380px]",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#2a2d35]">
          <div className="flex items-center gap-2">
            <NotebookPen className="w-5 h-5 text-[#00c853]" />
            <h2 className="text-white font-semibold">Anotações</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-md transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex p-2 bg-[#1a1e26] gap-1 shrink-0">
          {colunas.map((col) => (
            <button
              key={col.id}
              onClick={() => setActiveTabId(col.id)}
              className={cn(
                "flex-1 py-2 text-xs font-medium rounded-md transition-all relative truncate px-1",
                activeTabId === col.id 
                  ? "text-white" 
                  : "text-gray-400 hover:text-gray-200"
              )}
            >
              {col.nome}
              {activeTabId === col.id && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#00c853]" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!canOperate ? (
            <div className="text-center py-10">
              <p className="text-gray-500 text-sm">Selecione um workspace para usar as anotações.</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Add Button/Textarea */}
              {!isAdding ? (
                <button 
                  onClick={() => setIsAdding(true)}
                  className="w-full py-2 px-3 flex items-center gap-2 bg-[#00c853]/10 text-[#00c853] hover:bg-[#00c853]/20 rounded-lg transition-colors text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar Nota
                </button>
              ) : (
                <div className="bg-[#1a1e26] border border-[#2a2d35] rounded-lg p-3 space-y-2">
                  <textarea
                    ref={textareaRef}
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        addNote();
                      }
                      if (e.key === 'Escape') {
                        setIsAdding(false);
                        setNewNoteText('');
                      }
                    }}
                    placeholder="O que você está pensando?"
                    className="w-full bg-transparent border-none focus:ring-0 text-sm text-gray-200 resize-none min-h-[80px]"
                  />
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => { setIsAdding(false); setNewNoteText(''); }}
                      className="text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={addNote}
                      className="text-xs bg-[#00c853] text-white px-3 py-1 rounded hover:bg-[#00b24a] transition-colors"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              )}

              {/* List of Notes */}
              <div className="space-y-3">
                {columnCards.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-gray-500 text-sm italic">Nenhuma anotação nesta coluna.</p>
                  </div>
                ) : (
                  columnCards.map((note) => (
                    <div 
                      key={note.id}
                      className="group bg-[#1a1e26] border border-[#2a2d35] rounded-lg p-3 space-y-3"
                    >
                      <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                        {note.conteudo || <span className="italic text-gray-600">(Sem conteúdo)</span>}
                      </p>
                      
                      <div className="flex items-center justify-between pt-2 border-t border-[#2a2d35]">
                        <span className="text-[10px] text-gray-500">
                          {format(new Date(note.created_at), "dd MMM · HH:mm", { locale: ptBR })}
                        </span>
                        
                        <div className="flex items-center gap-1">
                          {getPrevColumnId(activeTabId) && (
                            <button 
                              onClick={() => handleMoveCard(note.id, getPrevColumnId(activeTabId)!)}
                              title="Mover para coluna anterior"
                              className="p-1 text-gray-500 hover:text-white hover:bg-white/5 rounded transition-colors"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                          )}
                          
                          <button 
                            onClick={() => handleDeleteCard(note.id)}
                            title="Deletar nota"
                            className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          
                          {getNextColumnId(activeTabId) && (
                            <button 
                              onClick={() => handleMoveCard(note.id, getNextColumnId(activeTabId)!)}
                              title="Mover para próxima coluna"
                              className="p-1 text-gray-500 hover:text-white hover:bg-white/5 rounded transition-colors"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};
