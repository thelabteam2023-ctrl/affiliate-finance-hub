import React, { useState, useEffect, useRef } from 'react';
import { 
  NotebookPen, 
  X, 
  Plus, 
  Trash2, 
  ArrowRight, 
  ArrowLeft,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Note {
  id: string;
  text: string;
  createdAt: string;
}

interface KanbanData {
  ideias: Note[];
  emAndamento: Note[];
  finalizado: Note[];
}

interface NotesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

type ColumnId = keyof KanbanData;

const COLUMNS: { id: ColumnId; label: string }[] = [
  { id: 'ideias', label: 'Ideias' },
  { id: 'emAndamento', label: 'Em Andamento' },
  { id: 'finalizado', label: 'Finalizado' },
];

export const NotesDrawer: React.FC<NotesDrawerProps> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<KanbanData>({
    ideias: [],
    emAndamento: [],
    finalizado: [],
  });
  const [activeTab, setActiveTab] = useState<ColumnId>('ideias');
  const [isAdding, setIsAdding] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('kanban_notes');
    if (saved) {
      try {
        setData(JSON.parse(saved));
      } catch (e) {
        console.error('Error parsing kanban_notes', e);
      }
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('kanban_notes', JSON.stringify(data));
  }, [data]);

  // Focus textarea when adding
  useEffect(() => {
    if (isAdding && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isAdding]);

  const addNote = () => {
    if (!newNoteText.trim()) {
      setIsAdding(false);
      return;
    }

    const newNote: Note = {
      id: crypto.randomUUID(),
      text: newNoteText,
      createdAt: new Date().toISOString(),
    };

    setData(prev => ({
      ...prev,
      [activeTab]: [newNote, ...prev[activeTab]],
    }));
    setNewNoteText('');
    setIsAdding(false);
  };

  const deleteNote = (column: ColumnId, id: string) => {
    setData(prev => ({
      ...prev,
      [column]: prev[column].filter(n => n.id !== id),
    }));
  };

  const moveNote = (from: ColumnId, to: ColumnId, note: Note) => {
    setData(prev => {
      const newData = { ...prev };
      newData[from] = newData[from].filter(n => n.id !== note.id);
      newData[to] = [note, ...newData[to]];
      return newData;
    });
  };

  const getNextColumn = (current: ColumnId): ColumnId | null => {
    if (current === 'ideias') return 'emAndamento';
    if (current === 'emAndamento') return 'finalizado';
    return null;
  };

  const getPrevColumn = (current: ColumnId): ColumnId | null => {
    if (current === 'finalizado') return 'emAndamento';
    if (current === 'emAndamento') return 'ideias';
    return null;
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

        {/* Tabs */}
        <div className="flex p-2 bg-[#1a1e26] gap-1">
          {COLUMNS.map((col) => (
            <button
              key={col.id}
              onClick={() => setActiveTab(col.id)}
              className={cn(
                "flex-1 py-2 text-xs font-medium rounded-md transition-all relative",
                activeTab === col.id 
                  ? "text-white" 
                  : "text-gray-400 hover:text-gray-200"
              )}
            >
              {col.label}
              {activeTab === col.id && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#00c853]" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
            {data[activeTab].length === 0 ? (
              <div className="text-center py-10">
                <p className="text-gray-500 text-sm italic">Nenhuma anotação nesta coluna.</p>
              </div>
            ) : (
              data[activeTab].map((note) => (
                <div 
                  key={note.id}
                  className="group bg-[#1a1e26] border border-[#2a2d35] rounded-lg p-3 space-y-3"
                >
                  <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                    {note.text}
                  </p>
                  
                  <div className="flex items-center justify-between pt-2 border-t border-[#2a2d35]">
                    <span className="text-[10px] text-gray-500">
                      {format(new Date(note.createdAt), "dd MMM · HH:mm", { locale: ptBR })}
                    </span>
                    
                    <div className="flex items-center gap-1">
                      {getPrevColumn(activeTab) && (
                        <button 
                          onClick={() => moveNote(activeTab, getPrevColumn(activeTab)!, note)}
                          title="Mover para coluna anterior"
                          className="p-1 text-gray-500 hover:text-white hover:bg-white/5 rounded transition-colors"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                      )}
                      
                      <button 
                        onClick={() => deleteNote(activeTab, note.id)}
                        title="Deletar nota"
                        className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      
                      {getNextColumn(activeTab) && (
                        <button 
                          onClick={() => moveNote(activeTab, getNextColumn(activeTab)!, note)}
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
        </div>
      </div>
    </>
  );
};
