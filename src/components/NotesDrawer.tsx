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
import { InsertCopyablePanel } from '@/components/anotacoes/InsertCopyablePanel';
import { FluxoResumoBar } from '@/components/anotacoes/FluxoResumoBar';
import { getColumnMeta, isBrandNew, isRecent, daysSince } from '@/components/anotacoes/fluxoColumnMeta';

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
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);

  const insertAtCursor = (snippet: string) => {
    const ta = textareaRef.current;
    const current = newNoteText;
    const start = ta?.selectionStart ?? current.length;
    const end = ta?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + snippet + current.slice(end);
    setNewNoteText(next);
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      const pos = start + snippet.length;
      textareaRef.current.setSelectionRange(pos, pos);
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

  const activeColumnMeta = view === 'fluxo' && activeColumn ? getColumnMeta(activeColumn.nome) : null;
  const isFinalizadoColumn = activeColumnMeta?.variant === 'muted';

  const { recentesFluxo, arquivadosFluxo } = React.useMemo(() => {
    if (view !== 'fluxo' || !isFinalizadoColumn) {
      return { recentesFluxo: columnCards, arquivadosFluxo: [] as typeof columnCards };
    }
    const recentes: typeof columnCards = [];
    const arquivados: typeof columnCards = [];
    for (const c of columnCards) {
      if (daysSince(c.updated_at || c.created_at) > 30) arquivados.push(c);
      else recentes.push(c);
    }
    return { recentesFluxo: recentes, arquivadosFluxo: arquivados };
  }, [columnCards, view, isFinalizadoColumn]);

  const emptyMessageFor = (nome?: string) => {
    const n = (nome || '').toLowerCase();
    if (n.includes('ideia')) return 'Nenhuma ideia por aqui — capture a próxima.';
    if (n.includes('andamento') || n.includes('progresso')) return 'Nada em execução no momento.';
    if (n.includes('finaliz') || n.includes('concluí') || n.includes('feito')) return 'Nada finalizado ainda.';
    return 'Nenhuma anotação aqui ainda.';
  };

  const renderNoteCard = (note: typeof columnCards[number]) => {
    const brandNew = view === 'fluxo' && isBrandNew(note.created_at);
    const recentlyUpdated = view === 'fluxo' && !brandNew && isRecent(note.updated_at);
    return (
      <div
        key={note.id}
        className={cn(
          "group relative bg-[#1a1e26] border rounded-lg p-3 hover:border-white/10 transition-colors shadow-sm min-w-0 max-w-full overflow-hidden",
          brandNew ? "border-[#00c853]/50" : "border-[#2a2d35]",
          isFinalizadoColumn && "opacity-75"
        )}
      >
        {recentlyUpdated && (
          <span
            aria-label="Editado recentemente"
            className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"
          />
        )}
        <div className="flex flex-wrap gap-2 mb-2">
          {brandNew && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#00c853]/15 text-[#00c853] border border-[#00c853]/30 uppercase tracking-wide">
              novo
            </span>
          )}
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
            {view === 'fluxo' && getPrevColumnId(activeTabId) && (
              <button
                onClick={() => handleMoveCard(note.id, getPrevColumnId(activeTabId)!)}
                title="Mover para coluna anterior"
                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
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

            {view === 'fluxo' && getNextColumnId(activeTabId) && (
              <button
                onClick={() => handleMoveCard(note.id, getNextColumnId(activeTabId)!)}
                title="Mover para próxima coluna"
                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

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
          <>
            {/* Resumo Bar — paridade com a sidebar */}
            <div className="px-2 pt-3">
              <FluxoResumoBar
                colunas={colunasFluxo}
                cards={cards as any}
                activeColumnId={activeTabId}
                onSelectColumn={(id) => setActiveTabId(id)}
              />
            </div>
            {/* Tabs enriquecidas com ícone + badge + dot */}
            <div className="flex px-4 gap-1 shrink-0 overflow-x-auto no-scrollbar">
              {colunasFluxo.map((col) => {
                const meta = getColumnMeta(col.nome);
                const Icon = meta.icon;
                const colCards = cards.filter((c) => c.coluna_id === col.id);
                const count = colCards.length;
                const hasRecent = colCards.some(
                  (c) => isRecent(c.updated_at) || isRecent(c.created_at)
                );
                const isMuted = meta.variant === 'muted';
                const isActive = activeTabId === col.id;
                return (
                  <button
                    key={col.id}
                    onClick={() => setActiveTabId(col.id)}
                    className={cn(
                      "flex-none py-2 px-2.5 text-xs font-medium rounded-t-md transition-all relative whitespace-nowrap flex items-center gap-1.5",
                      isActive
                        ? "text-white bg-[#1a1e26] border-x border-t border-[#2a2d35]"
                        : "text-gray-400 hover:text-gray-200",
                      isMuted && !isActive && "opacity-70"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5",
                        meta.variant === 'primary' && "text-[#00c853]",
                        meta.variant === 'accent' && "text-amber-500",
                        meta.variant === 'muted' && "text-gray-500",
                        meta.variant === 'neutral' && "text-gray-400"
                      )}
                    />
                    <span>{col.nome}</span>
                    <span
                      className={cn(
                        "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-semibold border",
                        meta.badgeClass,
                        count === 0 && "opacity-40"
                      )}
                    >
                      {count}
                    </span>
                    {hasRecent && !isMuted && (
                      <span
                        aria-label="Atividade recente"
                        className={cn("h-1.5 w-1.5 rounded-full animate-pulse", meta.dotClass)}
                      />
                    )}
                    {isActive && (
                      <div className="absolute -bottom-[1px] left-0 w-full h-[1px] bg-[#1a1e26]" />
                    )}
                  </button>
                );
              })}
            </div>
          </>
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
                    <div className="mb-2 pb-2 border-b border-[#2a2d35] space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Tag className="w-3.5 h-3.5 text-gray-500" />
                        <input
                          type="text"
                          list="notes-topic-suggestions"
                          value={newNoteCategory}
                          onChange={(e) => setNewNoteCategory(e.target.value)}
                          placeholder="Tópico (ex: Segurança) — use os existentes abaixo"
                          className="bg-transparent border-none focus:ring-0 text-xs text-gray-300 w-full p-0"
                        />
                        <datalist id="notes-topic-suggestions">
                          {allCategories.map((cat) => (
                            <option key={cat} value={cat} />
                          ))}
                        </datalist>
                      </div>
                      {allCategories.length > 0 && (() => {
                        const q = newNoteCategory.trim().toLowerCase();
                        const suggestions = allCategories
                          .filter((c) => c.toLowerCase() !== q)
                          .filter((c) => !q || c.toLowerCase().includes(q))
                          .slice(0, 6);
                        if (suggestions.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-1 pl-5">
                            <span className="text-[9px] uppercase tracking-wide text-gray-600 self-center mr-0.5">
                              reutilizar:
                            </span>
                            {suggestions.map((cat) => (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => setNewNoteCategory(cat)}
                                className="px-1.5 py-0.5 text-[10px] rounded bg-[#0f1218] text-gray-300 border border-[#2a2d35] hover:border-[#00c853]/40 hover:text-[#00c853] transition-colors"
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {/* Snippet toolbar */}
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setCopyDialogOpen(true)}
                      title="Adicionar valor copiável (token, proxy, URL, IP…)"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md bg-[#0f1218] text-gray-200 border border-[#2a2d35] hover:border-[#00c853]/40 hover:text-[#00c853] transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Dado copiável
                    </button>
                    <span className="text-[10px] text-gray-500 ml-auto">
                      gera um botão de copiar
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
                  <InsertCopyablePanel
                    open={copyDialogOpen}
                    onClose={() => setCopyDialogOpen(false)}
                    onInsert={insertAtCursor}
                    variant="drawer"
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
                    {view === 'fluxo' && activeColumnMeta ? (
                      <div className="flex flex-col items-center gap-2">
                        <activeColumnMeta.icon
                          className={cn(
                            "w-6 h-6",
                            activeColumnMeta.variant === 'primary' && "text-[#00c853]/70",
                            activeColumnMeta.variant === 'accent' && "text-amber-500/70",
                            activeColumnMeta.variant === 'muted' && "text-gray-500",
                            activeColumnMeta.variant === 'neutral' && "text-gray-400"
                          )}
                        />
                        <p className="text-gray-500 text-sm italic">{emptyMessageFor(activeColumn?.nome)}</p>
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm italic">Nenhuma anotação aqui ainda.</p>
                    )}
                  </div>
                ) : (
                  <>
                    {recentesFluxo.map(renderNoteCard)}
                    {view === 'fluxo' && isFinalizadoColumn && arquivadosFluxo.length > 0 && (
                      <details className="group rounded-lg border border-dashed border-[#2a2d35] bg-[#1a1e26]/30">
                        <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-medium text-gray-400 hover:text-gray-200 flex items-center justify-between">
                          <span>Ver arquivados (&gt; 30 dias)</span>
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-semibold border bg-muted/40 text-gray-400 border-[#2a2d35]">
                            {arquivadosFluxo.length}
                          </span>
                        </summary>
                        <div className="p-2 space-y-3">
                          {arquivadosFluxo.map(renderNoteCard)}
                        </div>
                      </details>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};
