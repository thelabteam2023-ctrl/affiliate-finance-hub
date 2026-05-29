import React, { useState, useEffect, useRef } from 'react';
import { 
  NotebookPen, 
  X, 
  Plus, 
  Trash2, 
  ChevronRight,
  ChevronLeft,
  Loader2,
  Tag,
  Filter,
  Pencil
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNotesData } from '@/hooks/useNotesData';
import { ContentRenderer } from '@/components/anotacoes/ContentRenderer';
import { InsertCopyableDialog } from '@/components/anotacoes/InsertCopyableDialog';

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
  const [newNoteCategory, setNewNoteCategory] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertSnippet = (kind: 'linha' | 'bloco') => {
    const ta = textareaRef.current;
    const current = newNoteText;
    const snippet = kind === 'linha' ? '`valor`' : '```label\nlinha1\nlinha2\n```';
    const start = ta?.selectionStart ?? current.length;
    const end = ta?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + snippet + current.slice(end);
    setNewNoteText(next);
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      // Posiciona o cursor sobre a primeira palavra editável
      const placeholderStart = start + (kind === 'linha' ? 1 : 4); // após ` ou ```\n? -> ajustamos abaixo
      if (kind === 'linha') {
        const s = start + 1;
        const e = s + 'valor'.length;
        textareaRef.current.setSelectionRange(s, e);
      } else {
        const s = start + 3; // após ```
        const e = s + 'label'.length;
        textareaRef.current.setSelectionRange(s, e);
      }
    });
  };

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

    if (editingCardId) {
      await handleUpdateCard(editingCardId, newNoteText, view === 'geral' ? newNoteCategory : undefined);
    } else {
      await handleCreateCard(currentActiveColumnId, newNoteText, view === 'geral' ? newNoteCategory : undefined);
    }
    
    setNewNoteText('');
    setNewNoteCategory('');
    setEditingCardId(null);
    setIsAdding(false);
  };

  const startEditing = (note: any) => {
    setNewNoteText(note.conteudo);
    setNewNoteCategory(note.categoria || '');
    setEditingCardId(note.id);
    setIsAdding(true);
  };

  const getNextColumnId = (currentId: string) => {
    const currentIndex = colunasFluxo.findIndex(c => c.id === currentId);
    if (currentIndex !== -1 && currentIndex < colunasFluxo.length - 1) {
      return colunasFluxo[currentIndex + 1].id;
    }
    return null;
  };

  const getPrevColumnId = (currentId: string) => {
    const currentIndex = colunasFluxo.findIndex(c => c.id === currentId);
    if (currentIndex > 0) {
      return colunasFluxo[currentIndex - 1].id;
    }
    return null;
  };

  const activeColumn = view === 'geral' ? colunaGeral : colunasFluxo.find(c => c.id === activeTabId);
  
  // Get all unique categories for the general view
  const allCategories = Array.from(new Set(
    cards
      .filter(c => c.coluna_id === colunaGeral?.id && c.categoria)
      .map(c => c.categoria!)
  )).sort();

  const columnCards = cards
    .filter(c => c.coluna_id === currentActiveColumnId)
    .filter(c => {
      if (view !== 'geral' || selectedCategory === 'Todas') return true;
      if (selectedCategory === 'Sem tópico') return !c.categoria;
      return c.categoria === selectedCategory;
    })
    .sort((a, b) => a.ordem - b.ordem);

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

        {/* View Switcher */}
        <div className="p-4 pb-0">
          <div className="flex bg-[#1a1e26] p-1 rounded-lg border border-[#2a2d35]">
            <button
              onClick={() => setView('geral')}
              className={cn(
                "flex-1 py-1.5 text-xs font-medium rounded-md transition-all",
                view === 'geral' 
                  ? "bg-[#00c853] text-white shadow-sm" 
                  : "text-gray-400 hover:text-gray-200"
              )}
            >
              Gerais
            </button>
            <button
              onClick={() => setView('fluxo')}
              className={cn(
                "flex-1 py-1.5 text-xs font-medium rounded-md transition-all",
                view === 'fluxo' 
                  ? "bg-[#00c853] text-white shadow-sm" 
                  : "text-gray-400 hover:text-gray-200"
              )}
            >
              Fluxo
            </button>
          </div>
        </div>

        {/* Tabs (only for Fluxo) */}
        {view === 'fluxo' && (
          <div className="flex px-4 pt-4 gap-1 shrink-0 overflow-x-auto no-scrollbar">
            {colunasFluxo.map((col) => (
              <button
                key={col.id}
                onClick={() => setActiveTabId(col.id)}
                className={cn(
                  "flex-none py-2 px-3 text-xs font-medium rounded-t-md transition-all relative whitespace-nowrap",
                  activeTabId === col.id 
                    ? "text-white bg-[#1a1e26] border-x border-t border-[#2a2d35]" 
                    : "text-gray-400 hover:text-gray-200"
                )}
              >
                {col.nome}
                {activeTabId === col.id && (
                  <div className="absolute -bottom-[1px] left-0 w-full h-[1px] bg-[#1a1e26]" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Categories Filter (only for Geral) */}
        {view === 'geral' && allCategories.length > 0 && (
          <div className="px-4 pt-4 shrink-0 overflow-x-auto no-scrollbar flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-gray-500 shrink-0" />
            <div className="flex gap-2">
              {['Todas', ...allCategories, 'Sem tópico'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "flex-none py-0.5 px-2 text-[10px] font-medium rounded transition-all whitespace-nowrap border",
                    selectedCategory === cat
                      ? "bg-[#00c853]/20 text-[#00c853] border-[#00c853]/30"
                      : "bg-[#1a1e26] text-gray-400 border-[#2a2d35] hover:text-gray-200 hover:border-gray-700"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className={cn(
          "flex-1 overflow-y-auto p-4 space-y-4",
          view === 'fluxo' ? "bg-[#1a1e26]/50" : ""
        )}>
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
                  onClick={() => {
                    setIsAdding(true);
                    setEditingCardId(null);
                    setNewNoteText('');
                    setNewNoteCategory('');
                  }}
                  className="w-full py-2.5 px-3 flex items-center gap-2 bg-[#00c853]/10 text-[#00c853] hover:bg-[#00c853]/20 rounded-lg transition-all text-sm font-medium border border-[#00c853]/20"
                >
                  <Plus className="w-4 h-4" />
                  Nova Anotação {view === 'geral' ? 'Geral' : `em ${activeColumn?.nome}`}
                </button>
              ) : (
                <div className="bg-[#1a1e26] border border-[#2a2d35] rounded-lg p-3 shadow-lg ring-1 ring-white/5">
                  {view === 'geral' && (
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[#2a2d35]">
                      <Tag className="w-3.5 h-3.5 text-gray-500" />
                      <input 
                        type="text"
                        value={newNoteCategory}
                        onChange={(e) => setNewNoteCategory(e.target.value)}
                        placeholder="Tópico (ex: Segurança)"
                        className="bg-transparent border-none focus:ring-0 text-xs text-gray-300 w-full p-0"
                      />
                    </div>
                  )}
                  {/* Snippet toolbar */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">Inserir:</span>
                    <button
                      type="button"
                      onClick={() => insertSnippet('linha')}
                      title="Inserir chip copiável inline (`valor`)"
                      className="px-2 py-0.5 text-[10px] font-medium rounded bg-[#0f1218] text-gray-300 border border-[#2a2d35] hover:border-[#00c853]/40 hover:text-[#00c853] transition-colors"
                    >
                      linha
                    </button>
                    <button
                      type="button"
                      onClick={() => insertSnippet('bloco')}
                      title="Inserir bloco copiável (```label … ```)"
                      className="px-2 py-0.5 text-[10px] font-medium rounded bg-[#0f1218] text-gray-300 border border-[#2a2d35] hover:border-[#00c853]/40 hover:text-[#00c853] transition-colors"
                    >
                      bloco
                    </button>
                    <span className="text-[10px] text-gray-600 ml-auto">
                      `valor` → chip · ```label\\n…``` → bloco
                    </span>
                  </div>
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
                        setNewNoteCategory('');
                        setEditingCardId(null);
                      }
                    }}
                    placeholder={view === 'geral' ? "Escreva sua anotação livre..." : "O que você está pensando?"}
                    className="w-full bg-transparent border-none focus:ring-0 text-sm text-gray-200 resize-none min-h-[100px] font-mono"
                  />
                  <div className="flex justify-end gap-2 pt-2 border-t border-[#2a2d35]">
                    <button 
                      onClick={() => { 
                        setIsAdding(false); 
                        setNewNoteText(''); 
                        setNewNoteCategory('');
                        setEditingCardId(null);
                      }}
                      className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={addNote}
                      className="px-4 py-1.5 text-xs bg-[#00c853] text-white rounded font-medium hover:bg-[#00b24a] transition-colors shadow-sm"
                    >
                      {editingCardId ? 'Atualizar' : 'Salvar'}
                    </button>
                  </div>
                </div>
              )}

              {/* List of Notes */}
              <div className="space-y-3">
                {columnCards.length === 0 ? (
                  <div className="text-center py-16 bg-[#1a1e26]/30 rounded-xl border border-dashed border-[#2a2d35]">
                    <p className="text-gray-500 text-sm italic">Nenhuma anotação aqui ainda.</p>
                  </div>
                ) : (
                  columnCards.map((note) => (
                    <div 
                      key={note.id}
                      className="group bg-[#1a1e26] border border-[#2a2d35] rounded-lg p-3 hover:border-white/10 transition-colors shadow-sm min-w-0 max-w-full overflow-hidden"
                    >
                      <div className="flex flex-wrap gap-2 mb-2">
                        {note.categoria && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[#00c853]/10 text-[#00c853] border border-[#00c853]/20">
                            <Tag className="w-2.5 h-2.5 mr-1" />
                            {note.categoria}
                          </span>
                        )}
                      </div>

                      {note.conteudo ? (
                        <ContentRenderer
                          content={note.conteudo}
                          compact
                          className="text-sm text-gray-200 leading-relaxed"
                        />
                      ) : (
                        <p className="text-sm italic text-gray-600">(Sem conteúdo)</p>
                      )}
                      
                      <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#2a2d35]">
                        <span className="text-[10px] text-gray-500">
                          {format(new Date(note.created_at), "dd MMM · HH:mm", { locale: ptBR })}
                        </span>
                        
                        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                          {view === 'fluxo' && (
                            <>
                              {getPrevColumnId(activeTabId) && (
                                <button 
                                  onClick={() => handleMoveCard(note.id, getPrevColumnId(activeTabId)!)}
                                  title="Mover para coluna anterior"
                                  className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors"
                                >
                                  <ChevronLeft className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                          
                          <button 
                            onClick={() => startEditing(note)}
                            title="Editar"
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          <button 
                            onClick={() => handleDeleteCard(note.id)}
                            title="Deletar nota"
                            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          
                          {view === 'fluxo' && (
                            <>
                              {getNextColumnId(activeTabId) && (
                                <button 
                                  onClick={() => handleMoveCard(note.id, getNextColumnId(activeTabId)!)}
                                  title="Mover para próxima coluna"
                                  className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors"
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              )}
                            </>
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
